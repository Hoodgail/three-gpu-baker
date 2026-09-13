// Host-side OptiX worker. NVIDIA SDK headers and libraries are supplied
// separately. Usage: lightmap-optix input-rgb.pfm unit-normals-rgb.pfm
// output-rgb.pfm
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <cuda_runtime.h>
#include <fstream>
#include <iostream>
#include <optix.h>
#include <optix_function_table_definition.h>
#include <optix_stubs.h>
#include <stdexcept>
#include <string>
#include <vector>

static void cudaCheck(cudaError_t r) {
  if (r != cudaSuccess)
    throw std::runtime_error(cudaGetErrorString(r));
}
static void optixCheck(OptixResult r) {
  if (r != OPTIX_SUCCESS)
    throw std::runtime_error(std::string(optixGetErrorName(r)) + ": " +
                             optixGetErrorString(r));
}
struct Image {
  unsigned width = 0, height = 0;
  std::vector<float> pixels;
};
static Image readPFM(const char *path) {
  std::ifstream f(path, std::ios::binary);
  std::string magic;
  Image out;
  float scale = 0;
  if (!(f >> magic >> out.width >> out.height >> scale) || magic != "PF" ||
      scale != -1.0f || out.width == 0 || out.height == 0 ||
      out.width > 16384 || out.height > 16384)
    throw std::runtime_error("Expected little-endian RGB PFM with scale -1.0");
  char newline;
  f.get(newline);
  if (newline == '\r')
    f.get(newline);
  if (newline != '\n')
    throw std::runtime_error("PFM header delimiter invalid");
  out.pixels.resize(size_t(out.width) * out.height * 3);
  f.read(reinterpret_cast<char *>(out.pixels.data()),
         std::streamsize(out.pixels.size() * 4));
  if (!f || f.peek() != std::char_traits<char>::eof())
    throw std::runtime_error("PFM payload length invalid");
  for (float x : out.pixels)
    if (!std::isfinite(x))
      throw std::runtime_error("Nonfinite PFM pixels");
  return out;
}
static void writePFM(const char *path, const Image &image) {
  std::ofstream f(path, std::ios::binary);
  f << "PF\n" << image.width << " " << image.height << "\n-1.0\n";
  f.write(reinterpret_cast<const char *>(image.pixels.data()),
          std::streamsize(image.pixels.size() * 4));
  if (!f)
    throw std::runtime_error("Cannot write output PFM");
}
struct DeviceBuffer {
  void *data = nullptr;
  size_t size = 0;
  explicit DeviceBuffer(size_t bytes) : size(std::max(size_t(4), bytes)) {
    cudaCheck(cudaMalloc(&data, size));
  }
  ~DeviceBuffer() {
    if (data)
      cudaFree(data);
  }
  DeviceBuffer(const DeviceBuffer &) = delete;
  DeviceBuffer &operator=(const DeviceBuffer &) = delete;
  CUdeviceptr ptr() const { return reinterpret_cast<CUdeviceptr>(data); }
};
struct Context {
  OptixDeviceContext value = nullptr;
  ~Context() {
    if (value)
      optixDeviceContextDestroy(value);
  }
};
struct Denoiser {
  OptixDenoiser value = nullptr;
  ~Denoiser() {
    if (value)
      optixDenoiserDestroy(value);
  }
};
static OptixImage2D describe(DeviceBuffer &buffer, const Image &image) {
  OptixImage2D d = {};
  d.data = buffer.ptr();
  d.width = image.width;
  d.height = image.height;
  d.rowStrideInBytes = image.width * 3 * sizeof(float);
  d.pixelStrideInBytes = 3 * sizeof(float);
  d.format = OPTIX_PIXEL_FORMAT_FLOAT3;
  return d;
}
int main(int argc, char **argv) {
  try {
    if (argc != 4)
      throw std::runtime_error(
          "Usage: lightmap-optix input.pfm normals.pfm output.pfm");
    const uint32_t endian = 1;
    if (*reinterpret_cast<const uint8_t *>(&endian) != 1)
      throw std::runtime_error("This worker requires a little-endian host");
    Image image = readPFM(argv[1]), normals = readPFM(argv[2]);
    if (image.width != normals.width || image.height != normals.height)
      throw std::runtime_error("Normal dimensions do not match");
    int devices = 0;
    cudaCheck(cudaGetDeviceCount(&devices));
    if (!devices)
      throw std::runtime_error("No CUDA-capable GPU is available");
    cudaCheck(cudaSetDevice(0));
    cudaCheck(cudaFree(nullptr));
    optixCheck(optixInit());
    Context context;
    OptixDeviceContextOptions contextOptions = {};
    optixCheck(
        optixDeviceContextCreate(nullptr, &contextOptions, &context.value));
    Denoiser denoiser;
    OptixDenoiserOptions options = {};
    options.guideAlbedo = 0;
    options.guideNormal =
        1; // Irradiance has already been demodulated from receiver albedo.
    optixCheck(optixDenoiserCreate(context.value, OPTIX_DENOISER_MODEL_KIND_HDR,
                                   &options, &denoiser.value));
    OptixDenoiserSizes sizes = {};
    optixCheck(optixDenoiserComputeMemoryResources(denoiser.value, image.width,
                                                   image.height, &sizes));
    const size_t bytes = image.pixels.size() * sizeof(float);
    DeviceBuffer input(bytes), normal(bytes), output(bytes),
        state(sizes.stateSizeInBytes),
        scratch(std::max(sizes.withoutOverlapScratchSizeInBytes, bytes)),
        intensity(sizeof(float));
    cudaCheck(cudaMemcpy(input.data, image.pixels.data(), bytes,
                         cudaMemcpyHostToDevice));
    cudaCheck(cudaMemcpy(normal.data, normals.pixels.data(), bytes,
                         cudaMemcpyHostToDevice));
    optixCheck(optixDenoiserSetup(denoiser.value, nullptr, image.width,
                                  image.height, state.ptr(), state.size,
                                  scratch.ptr(), scratch.size));
    OptixDenoiserLayer layer = {};
    layer.input = describe(input, image);
    layer.output = describe(output, image);
    OptixDenoiserGuideLayer guide = {};
    guide.normal = describe(normal, normals);
    optixCheck(optixDenoiserComputeIntensity(denoiser.value, nullptr,
                                             &layer.input, intensity.ptr(),
                                             scratch.ptr(), scratch.size));
    OptixDenoiserParams parameters = {};
    parameters.hdrIntensity = intensity.ptr();
    parameters.blendFactor = 0;
    optixCheck(optixDenoiserInvoke(denoiser.value, nullptr, &parameters,
                                   state.ptr(), state.size, &guide, &layer, 1,
                                   0, 0, scratch.ptr(), scratch.size));
    cudaCheck(cudaDeviceSynchronize());
    cudaCheck(cudaMemcpy(image.pixels.data(), output.data, bytes,
                         cudaMemcpyDeviceToHost));
    for (float &v : image.pixels) {
      if (!std::isfinite(v))
        throw std::runtime_error("OptiX returned nonfinite output");
      v = std::max(0.f, v);
    }
    writePFM(argv[3], image);
    return 0;
  } catch (const std::exception &error) {
    std::cerr << "OptiX: " << error.what() << "\n";
    return 1;
  }
}
