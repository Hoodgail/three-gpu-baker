/** Shared diffuse transport for Three.js TSL wgslFn and native WebGPU execution. */
export const WGSL_LIBRARY = /* wgsl */ `
const LM_PI: f32 = 3.141592653589793;
struct LMHit {
  t: f32, u: f32, v: f32, id: i32
}
struct LMSurface {
  p: vec3<f32>, n: vec3<f32>, g: vec3<f32>, uv: vec2<f32>, mat: u32, id: i32, back: bool
}
struct LMMaterial {
  albedo: vec3<f32>, emission: vec3<f32>, twoSided: bool
}
struct LMValue {
  direct: vec3<f32>, indirect: vec3<f32>, ao: f32
}
fn lm_pcg(value: u32) -> u32 {
  let state = value * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
fn lm_random(state: ptr<function,u32>) -> f32 {
  *state = lm_pcg(*state);
  return f32(*state >> 8u) / 16777216.0;
}
fn lm_max3(v: vec3<f32>) -> f32 {
  return max(v.x,max(v.y,v.z));
}
fn lm_power(a: f32,b: f32) -> f32 {
  return a*a / max(a*a+b*b,1e-30);
}
fn lm_cosine(n: vec3<f32>,rng: ptr<function,u32>) -> vec3<f32> {
  let r = sqrt(lm_random(rng));
  let phi = 2.0*LM_PI*lm_random(rng);
  var axis = vec3<f32>(1.0,0.0,0.0);
  if(abs(n.z)<0.999) {
    axis=vec3<f32>(0.0,0.0,1.0);
  }
  let tangent=normalize(cross(axis,n));
  let bitangent=cross(n,tangent);
  return r*cos(phi)*tangent + r*sin(phi)*bitangent + sqrt(max(0.0,1.0-r*r))*n;
}
fn lm_box(ro: vec3<f32>,rd: vec3<f32>,mn: vec3<f32>,mx: vec3<f32>,limit: f32,epsilon: f32) -> bool {
  var near=epsilon;
  var far=limit;
  for(var k=0u; k<3u; k++) {
    if(abs(rd[k])<1e-20) {
      if(ro[k]<mn[k] || ro[k]>mx[k]) {
        return false;
      }
    }
    else {
      let a=(mn[k]-ro[k])/rd[k];
      let b=(mx[k]-ro[k])/rd[k];
      near=max(near,min(a,b));
      far=min(far,max(a,b));
      if(far<near) {
        return false;
      }
    }
  }
  return true;
}
fn lm_trace(scene: ptr<storage,array<vec4<f32>>,read>,ro: vec3<f32>,rd: vec3<f32>,limit: f32,skip: i32,anyHit: bool) -> LMHit {
  var hit=LMHit(limit,0.0,0.0,-1);
  var node=0u;
  let count=u32((*scene)[0].y);
  let nodeBase=u32((*scene)[1].y);
  let triBase=u32((*scene)[1].x);
  let epsilon=(*scene)[2].w*0.01;
  // Escape links always advance. This loop is bounded by nodeCount, not sampleCount.
  for(var visit=0u; visit<count && node<count; visit++) {
    let a=nodeBase+node*3u;
    let mn=(*scene)[a];
    let mx=(*scene)[a+1u];
    if(!lm_box(ro,rd,mn.xyz,mx.xyz,hit.t,epsilon)) {
      node=u32(mn.w);
      continue;
    }
    if(mx.w>0.0) {
      let first=u32((*scene)[a+2u].x);
      let end=first+u32(mx.w);
      for(var i=first; i<end; i++) {
        if(i32(i)==skip) {
          continue;
        }
        let t=triBase+i*8u;
        let v0=(*scene)[t].xyz;
        let e1=(*scene)[t+1u].xyz-v0;
        let e2=(*scene)[t+2u].xyz-v0;
        let p=cross(rd,e2);
        let det=dot(e1,p);
        if(abs(det)<1e-10) {
          continue;
        }
        let inv=1.0/det;
        let offset=ro-v0;
        let u=dot(offset,p)*inv;
        if(u<0.0||u>1.0) {
          continue;
        }
        let q=cross(offset,e1);
        let v=dot(rd,q)*inv;
        if(v<0.0||u+v>1.0) {
          continue;
        }
        let distance=dot(e2,q)*inv;
        if(distance>epsilon&&distance<hit.t) {
          hit=LMHit(distance,u,v,i32(i));
          if(anyHit) {
            return hit;
          }
        }
      }
      node=u32(mn.w);
    }
    else {
      node++;
    }
  }
  return hit;
}
fn lm_surface(scene: ptr<storage,array<vec4<f32>>,read>,h: LMHit,rd: vec3<f32>) -> LMSurface {
  let a=u32((*scene)[1].x)+u32(h.id)*8u;
  let v0=(*scene)[a];
  let v1=(*scene)[a+1u].xyz;
  let v2=(*scene)[a+2u].xyz;
  let w=1.0-h.u-h.v;
  let p=v0.xyz*w+v1*h.u+v2*h.v;
  var g=normalize(cross(v1-v0.xyz,v2-v0.xyz));
  var n=normalize((*scene)[a+3u].xyz*w+(*scene)[a+4u].xyz*h.u+(*scene)[a+5u].xyz*h.v);
  if(dot(n,g)<0.0) {
    n=-n;
  }
  let back=dot(g,rd)>0.0;
  if(back) {
    g=-g;
    n=-n;
  }
  let uv=(*scene)[a+6u].xy*w+(*scene)[a+6u].zw*h.u+(*scene)[a+7u].xy*h.v;
  return LMSurface(p,n,g,uv,u32(v0.w),h.id,back);
}
fn lm_wrap(i: i32,size: i32,mode: u32) -> i32 {
  if(mode==1u) {
    return ((i%size)+size)%size;
  }
  if(mode==2u) {
    let j=((i%(size*2))+size*2)%(size*2);
    if(j<size) {
      return j;
    }
    return size*2-1-j;
  }
  return clamp(i,0,size-1);
}
fn lm_texture(scene: ptr<storage,array<vec4<f32>>,read>,desc: vec4<f32>,tx: vec4<f32>,ty: vec4<f32>,uv: vec2<f32>) -> vec3<f32> {
  if(desc.y<1.0) {
    return vec3<f32>(1.0);
  }
  let flags=u32(desc.w);
  let width=i32(desc.y);
  let height=i32(desc.z);
  let u=dot(tx.xyz,vec3<f32>(uv,1.0));
  var v=dot(ty.xyz,vec3<f32>(uv,1.0));
  if((flags&16u)!=0u) {
    v=1.0-v;
  }
  let xy=vec2<f32>(u*f32(width),v*f32(height))-0.5;
  let base=vec2<i32>(floor(xy));
  let f=fract(xy);
  var value=vec3<f32>(0.0);
  for(var j=0; j<2; j++) {
    for(var i=0; i<2; i++) {
      let x=lm_wrap(base.x+i,width,flags&3u);
      let y=lm_wrap(base.y+j,height,(flags>>2u)&3u);
      let weight=select(1.0-f.x,f.x,i==1)*select(1.0-f.y,f.y,j==1);
      value+=(*scene)[u32(desc.x)+u32(y*width+x)].xyz*weight;
    }
  }
  return value;
}
fn lm_material(scene: ptr<storage,array<vec4<f32>>,read>,id: u32,uv: vec2<f32>) -> LMMaterial {
  let a=u32((*scene)[1].z)+id*8u;
  let base=(*scene)[a];
  let emission=(*scene)[a+1u];
  let albedo=clamp(base.xyz*lm_texture(scene,(*scene)[a+2u],(*scene)[a+4u],(*scene)[a+5u],uv),vec3<f32>(0.0),vec3<f32>(1.0))*(1.0-base.w);
  let e=max(vec3<f32>(0.0),emission.xyz*lm_texture(scene,(*scene)[a+3u],(*scene)[a+6u],(*scene)[a+7u],uv));
  return LMMaterial(albedo,e,emission.w>0.5);
}
fn lm_direct(scene: ptr<storage,array<vec4<f32>>,read>,s: LMSurface,rng: ptr<function,u32>) -> vec3<f32> {
  let count=u32((*scene)[0].w);
  if(count==0u) {
    return vec3<f32>(0.0);
  }
  let index=min(count-1u,u32(lm_random(rng)*f32(count)));
  let a=u32((*scene)[1].w)+index*6u;
  let info=(*scene)[a];
  let color=(*scene)[a+1u];
  let position=(*scene)[a+2u];
  let direction=(*scene)[a+3u];
  let kind=u32(info.x);
  var q=position.xyz;
  var wi=vec3<f32>(0.0,1.0,0.0);
  var distance=1e30;
  var radiance=color.xyz;
  var area=0.0;
  var normal=vec3<f32>(0.0);
  var twoSided=false;
  let epsilon=(*scene)[2].w;
  if(kind==1u) {
    wi=-normalize(direction.xyz);
  }
  else {
    if(kind==3u) {
      let u=(*scene)[a+4u].xyz;
      let v=(*scene)[a+5u].xyz;
      let r1=2.0*lm_random(rng)-1.0;
      let r2=2.0*lm_random(rng)-1.0;
      q=position.xyz+u*r1+v*r2;
      let c=cross(u,v);
      area=4.0*length(c);
      normal=normalize(c);
    }
    else if(kind==4u) {
      let ta=u32((*scene)[1].x)+u32(info.y)*8u;
      let v0=(*scene)[ta];
      let v1=(*scene)[ta+1u].xyz;
      let v2=(*scene)[ta+2u].xyz;
      let r=sqrt(lm_random(rng));
      let v=lm_random(rng);
      let w=vec3<f32>(1.0-r,r*(1.0-v),r*v);
      q=v0.xyz*w.x+v1*w.y+v2*w.z;
      normal=normalize(cross(v1-v0.xyz,v2-v0.xyz));
      area=info.z;
      let uv=(*scene)[ta+6u].xy*w.x+(*scene)[ta+6u].zw*w.y+(*scene)[ta+7u].xy*w.z;
      let material=lm_material(scene,u32(v0.w),uv);
      radiance=material.emission;
      twoSided=material.twoSided;
    }
    let delta=q-s.p;
    distance=length(delta);
    if(distance<epsilon*2.0) {
      return vec3<f32>(0.0);
    }
    wi=delta/distance;
  }
  let cosine=max(0.0,dot(s.n,wi));
  if(cosine<=0.0) {
    return vec3<f32>(0.0);
  }
  var factor=f32(count)*cosine/LM_PI;
  if(area>0.0) {
    var lightCos=dot(normal,-wi);
    if(twoSided) {
      lightCos=abs(lightCos);
    }
    if(lightCos<=1e-8) {
      return vec3<f32>(0.0);
    }
    let pdf=distance*distance/(area*lightCos*f32(count));
    factor=cosine/(LM_PI*pdf);
    // RectAreaLight has no intersectable geometry: only emitting triangles use MIS.
    if(kind==4u) {
      factor*=lm_power(pdf,cosine/LM_PI);
    }
  }
  else if(kind!=1u) {
    var attenuation=1.0/max(1e-12,pow(distance,info.w));
    if(color.w>0.0) {
      let cutoff=max(0.0,1.0-pow(distance/color.w,4.0));
      attenuation*=cutoff*cutoff;
    }
    if(kind==2u) {
      let angleCos=dot(normalize(direction.xyz),-wi);
      var cone=select(0.0,1.0,angleCos>=direction.w);
      if(direction.w-position.w>=1e-8) {
        cone=smoothstep(position.w,direction.w,angleCos);
      }
      attenuation*=cone;
    }
    factor*=attenuation;
  }
  if(factor<=0.0) {
    return vec3<f32>(0.0);
  }
  let origin=s.p+s.g*epsilon;
  var shadowDirection=wi;
  var shadowDistance=1e30;
  if(kind!=1u) {
    let delta=q-origin;
    shadowDirection=normalize(delta);
    shadowDistance=length(delta)-epsilon;
  }
  if(lm_trace(scene,origin,shadowDirection,shadowDistance,s.id,true).id>=0) {
    return vec3<f32>(0.0);
  }
  return radiance*factor;
}
fn lm_emitter_pdf(scene: ptr<storage,array<vec4<f32>>,read>,s: LMSurface,previous: vec3<f32>,twoSided: bool) -> f32 {
  let a=u32((*scene)[1].x)+u32(s.id)*8u;
  let p=(*scene)[a].xyz;
  let c=cross((*scene)[a+1u].xyz-p,(*scene)[a+2u].xyz-p);
  let area=0.5*length(c);
  let delta=s.p-previous;
  var cosine=dot(normalize(c),-normalize(delta));
  if(twoSided) {
    cosine=abs(cosine);
  }
  if(cosine<=0.0) {
    return 0.0;
  }
  return dot(delta,delta)/(area*cosine*(*scene)[0].w);
}
fn lm_sample(scene: ptr<storage,array<vec4<f32>>,read>,surface: LMSurface,rng: ptr<function,u32>) -> LMValue {
  var direct=lm_direct(scene,surface,rng);
  var indirect=vec3<f32>(0.0);
  var ao=1.0;
  var direction=lm_cosine(surface.n,rng);
  var throughput=vec3<f32>(1.0);
  let epsilon=(*scene)[2].w;
  let bounces=u32((*scene)[2].y);
  var origin=surface.p+surface.g*epsilon;
  var previous=surface.p;
  var skip=surface.id;
  var pdf=max(0.0,dot(surface.n,direction))/LM_PI;
  for(var depth=0u; depth<=bounces; depth++) {
    let hit=lm_trace(scene,origin,direction,1e30,skip,false);
    if(depth==0u) {
      ao=select(0.0,1.0,hit.id<0||hit.t>=(*scene)[2].z);
    }
    if(hit.id<0) {
      let contribution=throughput*(*scene)[3].xyz;
      if(depth==0u) {
        direct+=contribution;
      }
      else {
        indirect+=contribution;
      }
      break;
    }
    let s=lm_surface(scene,hit,direction);
    let m=lm_material(scene,s.mat,s.uv);
    if(s.back&&!m.twoSided) {
      break;
    }
    if(lm_max3(m.emission)>0.0) {
      let contribution=throughput*m.emission*lm_power(pdf,lm_emitter_pdf(scene,s,previous,m.twoSided));
      if(depth==0u) {
        direct+=contribution;
      }
      else {
        indirect+=contribution;
      }
    }
    if(depth==bounces) {
      break;
    }
    throughput*=m.albedo;
    if(lm_max3(throughput)<=0.0) {
      break;
    }
    indirect+=throughput*lm_direct(scene,s,rng);
    if(depth>=2u) {
      let survival=clamp(lm_max3(throughput),0.05,0.95);
      if(lm_random(rng)>=survival) {
        break;
      }
      throughput/=survival;
    }
    direction=lm_cosine(s.n,rng);
    if(dot(s.g,direction)<=0.0) {
      break;
    }
    pdf=max(0.0,dot(s.n,direction))/LM_PI;
    previous=s.p;
    origin=s.p+s.g*epsilon;
    skip=s.id;
  }
  let cap=(*scene)[3].w;
  if(cap>0.0) {
    direct=min(direct,vec3<f32>(cap));
    indirect=min(indirect,vec3<f32>(cap));
  }
  return LMValue(direct,indirect,ao);
}
`;

export const WGSL_ENTRY = /* wgsl */ `
fn lm_bake(pixel: u32,sampleIndex: u32,seed: u32,scene: ptr<storage,array<vec4<f32>>,read>,atlas: ptr<storage,array<vec4<f32>>,read>,output: ptr<storage,array<vec4<f32>>,read_write>) -> u32 {
  let i=pixel*3u;
  let p=(*atlas)[i];
  if(p.w<0.5) {
    return 0u;
  }
  let n=(*atlas)[i+1u];
  let g=(*atlas)[i+2u];
  let surface=LMSurface(p.xyz,n.xyz,g.xyz,vec2<f32>(0.0),0u,i32(g.w)-1,false);
  var rng=lm_pcg(pixel^((sampleIndex+1u)*0x9e3779b9u)^seed);
  let value=lm_sample(scene,surface,&rng);
  let old=(*output)[i];
  let count=old.w+1.0;
  (*output)[i]=vec4<f32>(old.xyz+(value.direct-old.xyz)/count,count);
  let indirect=(*output)[i+1u];
  (*output)[i+1u]=vec4<f32>(indirect.xyz+(value.indirect-indirect.xyz)/count,count);
  let ao=(*output)[i+2u].x;
  (*output)[i+2u]=vec4<f32>(ao+(value.ao-ao)/count,0.0,0.0,count);
  return 0u;
}
`;

export function rawComputeWGSL() {
  return (
    WGSL_LIBRARY +
    WGSL_ENTRY +
    /* wgsl */ `
@group(0) @binding(0) var<storage,read> lm_scene: array<vec4<f32>>;
@group(0) @binding(1) var<storage,read> lm_atlas: array<vec4<f32>>;
@group(0) @binding(2) var<storage,read_write> lm_output: array<vec4<f32>>;
@group(0) @binding(3) var<uniform> lm_params: vec4<u32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if(id.x>=lm_params.y) {
    return;
  }
  let ignored=lm_bake(lm_params.x+id.x,lm_params.z,lm_params.w,&lm_scene,&lm_atlas,&lm_output);
}
`
  );
}
