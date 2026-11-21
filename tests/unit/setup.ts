// jsdom has no canvas implementation; the renderer and skin painter handle a null context.
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
