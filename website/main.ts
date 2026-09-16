import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import './style.css';
import { marked } from 'marked';
import { Playground } from './Playground.js';
const pages = import.meta.glob('../docs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const navigation = [
  ['quickstart', 'Quick start'],
  ['api', 'API reference'],
  ['configuration', 'Bake configuration'],
  ['examples', 'Example scenes'],
  ['io', 'Import & export'],
  ['denoising', 'Denoising & OptiX'],
  ['probes', 'Light probes'],
  ['architecture', 'Extending the baker'],
  ['performance', 'Performance & scope'],
];
const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = /* HTML */ `<header class="site-header">
    <a class="brand" href="#">
      <span>three gpu baker </span>
    </a>
    <nav aria-label="Main navigation">
      <a href="#" data-nav="home">Overview</a>
      <a href="#docs/quickstart" data-nav="docs">Documentation</a>
      <a href="#examples" data-nav="examples">Examples <span class="nav-dot"> </span> </a>
    </nav>
    <a class="github-link" href="https://github.com/Hoodgail/three-gpu-baker">GitHub ↗</a>
    <button class="mobile-menu" aria-label="Toggle navigation" aria-expanded="false">☰</button>
  </header>
  <main id="content"></main>
  <footer class="site-footer">
    <span>Open source. MIT licensed. Built for Three.js.</span>
  </footer>`;
const content = app.querySelector<HTMLElement>('#content')!;
let playground: Playground | undefined;
let routeQueue = Promise.resolve();
const base = import.meta.env.BASE_URL;
function home() {
  return /* HTML */ `<section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">V1.0</p>
        <h1>
          Light, made<br />
          <em>portable.</em>
        </h1>
        <p class="hero-description">Bake the atmosphere.<br />Keep the frame rate.</p>
        <p class="hero-detail">
          Progressive global illumination for Three.js.<br />A modular TypeScript API, powered by
          TSL and WebGPU.
        </p>
        <div class="hero-actions">
          <a href="#examples" class="button primary">Open the lighting lab <span>↗</span> </a>
          <a href="#docs/quickstart" class="text-link">Read the docs →</a>
        </div>
        <button class="install" aria-label="Copy npm install command">
          <span>$</span>
          <code>npm i three-gpu-baker three</code>
          <span id="copy-state">⧉</span>
        </button>
      </div>
      <div class="hero-render">
        <div class="render-tag"><span class="live-dot"> </span> DIFFUSE TRANSPORT</div>
        <img
          src="${base}images/cornell.png"
          alt="A Cornell room rendered with baked light; a warm emitter and red and green walls cast colored bounce light onto two blocks"
        />
        <div class="render-caption">
          <span>01 / Cornell room</span>
          <span>256 samples · 3 bounces</span>
        </div>
        <span class="render-coordinate">X 0.65 &nbsp; Y 1.55 &nbsp; Z 6.10</span>
      </div>
    </section>
    <section class="spec-strip">
      <div>
        <strong>TSL + WebGPU</strong>
        <span>One modern compute pipeline</span>
      </div>
      <div>
        <strong>Progressive by design</strong>
        <span>Bounded tiles, responsive updates</span>
      </div>
      <div>
        <strong>Separate light channels</strong>
        <span>Direct, indirect, ambient occlusion</span>
      </div>
      <div>
        <strong>Take your data anywhere</strong>
        <span>GLB, HDR lightmaps, SH9 probes</span>
      </div>
    </section>
    <section class="section-header">
      <div>
        <p class="eyebrow">FROM PHOTONS TO PIXELS</p>
        <h2>More than a shadow map.</h2>
      </div>
      <p>
        Trace diffuse light through your scene.<br />Inspect every contribution. Export only what
        you need.
      </p>
    </section>
    <section class="feature-grid">
      <article class="feature-large">
        <div class="feature-number">01 / TRANSPORT</div>
        <h3>Let the room<br />color the light.</h3>
        <p>
          Diffuse bounces, textured emission, and colored point, spot, directional, and rectangular
          lights. Build depth with the light already in your scene.
        </p>
        <a href="#examples" class="text-link">Explore the examples ↗</a>
        <div class="spectrum"></div>
      </article>
      <article>
        <span class="feature-number">02 / CONTROL</span>
        <h3>One sample at a time.</h3>
        <p>
          Start, pause, resume. Downscale a preview, tune your bounce budget, and denoise indirect
          light and AO independently.
        </p>
        <div class="sample-bars">
          ${[12, 22, 34, 45, 57, 66, 75, 84, 91, 96, 99, 100]
            .map(
              (h) => `<i style="height:${h}%">
</i>`,
            )
            .join('')}
        </div>
      </article>
      <article>
        <span class="feature-number">03 / INTEGRATION</span>
        <h3>Your renderer.<br />Your workflow.</h3>
        <p>
          Typed classes with replaceable backends, scene compilers, and denoisers. Keep your source
          meshes intact and export a detached model.
        </p>
        <pre>
<code>const baker = new LightmapBaker({
  renderer,
  samples: 128,
  bounces: 3,
});

await baker.prepare(scene);
const lightmaps = await baker.bake();</code>
</pre>
      </article>
    </section>
    <section class="closing">
      <p class="eyebrow">A SMALL API. A LOT OF LIGHT.</p>
      <h2>Start with a room.<br />Build your world.</h2>
      <a href="#docs/quickstart" class="button primary">Get started <span>→</span> </a>
    </section>`;
}
async function route() {
  await playground?.dispose();
  playground = undefined;
  const hash = location.hash.slice(1);
  const section = hash.startsWith('docs') ? 'docs' : hash === 'examples' ? 'examples' : 'home';
  app
    .querySelectorAll('[data-nav]')
    .forEach((link) =>
      link.classList.toggle('active', (link as HTMLElement).dataset.nav === section),
    );
  app.querySelector('.site-header')!.classList.remove('menu-open');
  app.querySelector('.mobile-menu')!.setAttribute('aria-expanded', 'false');
  if (section === 'home') {
    document.title = 'Three GPU Baker — Light, made portable.';
    content.innerHTML = home();
    content.querySelector<HTMLButtonElement>('.install')!.onclick = async () => {
      try {
        await navigator.clipboard.writeText('npm i three-gpu-baker three');
        content.querySelector('#copy-state')!.textContent = 'Copied';
      } catch {
        content.querySelector('#copy-state')!.textContent = 'Select to copy';
      }
    };
  } else if (section === 'examples') {
    document.title = 'Lighting lab — Three GPU Baker';
    content.innerHTML = '<section class="lab"></section>';
    playground = new Playground(content.firstElementChild as HTMLElement);
  } else {
    const slug = hash.split('/')[1] || 'quickstart';
    const title = navigation.find((item) => item[0] === slug)?.[1] ?? 'Documentation';
    document.title = `${title} — Three GPU Baker`;
    const markdown =
      pages[`../docs/${slug}.md`] ?? '# Page not found\nChoose a topic from the navigation.';
    content.innerHTML = /* HTML */ `<div class="docs-layout">
      <aside class="docs-nav">
        <p class="eyebrow">DOCUMENTATION</p>
        <label class="search-box">
          <span>⌕</span>
          <input
            id="doc-search"
            aria-label="Filter documentation topics"
            placeholder="Find a topic…"
          />
        </label>
        <nav aria-label="Documentation topics">
          ${navigation.map(([id, label]) => `<a href="#docs/${id}" class="${slug === id ? 'active' : ''}">${label}</a>`).join('')}
        </nav>
        <div class="docs-version"><span class="live-dot"> </span> v1.0 · Three.js r186</div>
      </aside>
      <article class="prose">
        <div class="breadcrumb">Documentation <span>/</span> ${title}</div>
        ${await marked.parse(markdown)}
      </article>
    </div>`;
    content.querySelectorAll<HTMLAnchorElement>('.prose a').forEach((a) => {
      const href = a.getAttribute('href') ?? '';
      if (href.endsWith('.md')) a.href = '#docs/' + href.replace(/^.*\//, '').replace('.md', '');
    });
    content.querySelector<HTMLInputElement>('#doc-search')!.oninput = (e) => {
      const term = (e.target as HTMLInputElement).value.toLowerCase();
      content
        .querySelectorAll<HTMLAnchorElement>('.docs-nav nav a')
        .forEach((a) => (a.hidden = !a.textContent!.toLowerCase().includes(term)));
    };
  }
  window.scrollTo(0, 0);
}
app.querySelector('.mobile-menu')!.addEventListener('click', () => {
  const open = app.querySelector('.site-header')!.classList.toggle('menu-open');
  app.querySelector('.mobile-menu')!.setAttribute('aria-expanded', String(open));
});
window.addEventListener('hashchange', () => {
  routeQueue = routeQueue.then(route).catch(console.error);
});
void route();
