class Renderer {

  domElement: HTMLCanvasElement
  lostContext: boolean = false
  gl: WebGL2RenderingContext


  width: number
  height: number
  private _pixelRatio: number = 1
  get pixelRatio() { return this._pixelRatio; } set pixelRatio(value) { if (value === undefined) { return; } this._pixelRatio = value; this.setSize(this.width, this.height, false) }

  constructor({
    depth = true,
    stencil = false,
    alpha = false,
    antialias = false,
    premultipliedAlpha = true,
    preserveDrawingBuffer = false,
    powerPreference = 'default',
    failIfMajorPerformanceCaveat = false
  }) {
    this.domElement = (() => {
      const canvas = <HTMLCanvasElement> document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas')
      canvas.style.display = 'block';
      return canvas;
    })();

    this.width = this.domElement.width;
    this.height = this.domElement.height;

    // @ts-ignore
    this.domElement.addEventListener('webglcontextlost', this.onContextLost);
    // @ts-ignore
    this.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    // @ts-ignore
    this.domElement.addEventListener('webglcontextcreationerror', this.onContextCreationError);

    this.gl = <WebGL2RenderingContext> this.domElement.getContext("webgl2", {
      alpha: true,
      depth,
      stencil,
      antialias,
      premultipliedAlpha,
      preserveDrawingBuffer,
      powerPreference,
      failIfMajorPerformanceCaveat
    })

    if (this.gl === null) {
      if (this.domElement.getContext("webgl2")) {
        throw new Error('Error creating WebGL context with your selected attributes.');
      } else {
        throw new Error('Error creating WebGL context.');
      }
    }
  }

  isWebGL2Available = () => {
    try {
      return !!(window.WebGL2RenderingContext && this.gl)
    } catch (e) {
      return false;
    }
  }

  createVertexShader = (source: string) => this.createShader(this.gl.VERTEX_SHADER, source);
  createFragmentShader = (source: string) => this.createShader(this.gl.FRAGMENT_SHADER, source);

  createShader = (type: GLenum, source: string) => {
    let shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    let success = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS);
    if (success) return shader;

    console.log(this.gl.getShaderInfoLog(shader));
    this.gl.deleteShader(shader);
    throw new Error('Error creating shader')
  }

  createProgram = (vertexShader: WebGLShader, fragmentShader: WebGLShader) => {
    let program = this.gl.createProgram();
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    let success = this.gl.getProgramParameter(program, this.gl.LINK_STATUS);
    if (success) return program;

    console.log(this.gl.getProgramInfoLog(program));
    this.gl.deleteProgram(program);
    throw new Error('Error creating program')
  }

  setSize = (width: number, height: number, updateStyle = true) => {
    // TODO if xr.isPresenting, console.warn
    this.width = width;
    this.height = height;

    this.domElement.width = Math.floor(width * this.pixelRatio)
    this.domElement.height = Math.floor(height * this.pixelRatio)

    if (updateStyle) {
      this.domElement.style.width = width + 'px';
      this.domElement.style.height = height + 'px';
    }

    this.setViewport(0, 0, width, height);
  }

  setViewport(x: number, y: number, width: number, height: number) {
    // TODO: Check if current viewport .equals viewport

    this.gl.viewport(Math.round(x * this.pixelRatio), Math.round(y * this.pixelRatio), Math.round(width * this.pixelRatio), Math.round(height * this.pixelRatio));
  }

  onContextLost = (event: WebGLContextEvent) => {
    event.preventDefault()
    console.log('WebGL: Context lost')
    this.lostContext = true;
  }

  onContextRestored = (event: WebGLContextEvent) => {
    console.log('WebGL: Context restored')
  }

  onContextCreationError = (event: WebGLContextEvent) => {
    console.log('WebGL: Context creation error: ', event.statusMessage)
  }

}

export default Renderer;