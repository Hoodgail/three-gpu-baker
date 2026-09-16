/** glTF/GLB and OBJ import, glTF/GLB export, and local dependent-file resolution. */
export class ModelIO {
    async load(...args) {
        return (await import('./io.js')).importModel(...args);
    }
    async loadFiles(...args) {
        return (await import('./io.js')).importModelFiles(...args);
    }
    async export(...args) {
        return (await import('./io.js')).exportModel(...args);
    }
}
export class ThreeSceneAdapter {
    async extract(...args) {
        return (await import('./scene.js')).extractThreeScene(...args);
    }
}
//# sourceMappingURL=ModelIO.js.map