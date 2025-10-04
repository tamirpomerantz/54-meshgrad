import { VERTEX_SHADER, FRAGMENT_SHADER, POINT_VERTEX_SHADER, POINT_FRAGMENT_SHADER, POST_VERTEX_SHADER, LEVELS_FRAGMENT_SHADER, PIXELATE_FRAGMENT_SHADER, DITHER_FRAGMENT_SHADER } from './shaders.js';

const MAX_POINTS = 32;

export class Warp {
    constructor(parent, which, src = [], dst = []) {
    this.parent = parent;
    this.which = which;
    this.src = src;
    this.dst = dst;
        this.s2 = new Array(MAX_POINTS).fill(0);
        this.w = new Array(MAX_POINTS).fill([0, 0]);
    }

    npoints() {
        return this.parent.npoints;
    }

    get_src() {
        return this.src.slice(0, this.npoints()).map(point => point.slice());
    }

    get_dst() {
        return this.dst.slice(0, this.npoints()).map(point => point.slice());
    }

    distance_squared(x, y, y_is_x) {
    if (y_is_x) {
            const gram = x.map(r => x.map(c => r[0] * c[0] + r[1] * c[1]));
            return x.map((_, r) => x.map((_, c) => gram[r][r] + gram[c][c] - 2 * gram[r][c]));
        } else {
            const gram = x.map(r => y.map(c => r[0] * c[0] + r[1] * c[1]));
            const diagx = x.map(p => p[0] * p[0] + p[1] * p[1]);
            const diagy = y.map(p => p[0] * p[0] + p[1] * p[1]);
            return x.map((_, r) => y.map((_, c) => diagx[r] + diagy[c] - 2 * gram[r][c]));
        }
    }

    rbf(x, y, y_is_x) {
        const dists2 = this.distance_squared(x, y, y_is_x);

        if (y_is_x) {
            const d2max = Math.max(...dists2.flat());
            const dtmp = dists2.map((row, r) => row.map((val, c) => r === c ? d2max : val));
            
            for (let c = 0; c < dtmp[0].length; c++) {
                this.s2[c] = Math.min(...dtmp.map(row => row[c]));
            }
        }

        return dists2.map(row => row.map((val, c) => Math.sqrt(val + this.s2[c])));
    }

    update() {
        if (this.npoints() < 4) return;

        const x = this.get_src();
        const y = this.get_dst();
        const H = this.rbf(x, x, true);
        const w = linsolve(H, y);
        this.w = w;
    }

    warp(verts) {
        if (this.npoints() < 4) return verts.slice();

        const H = this.rbf(verts, this.get_src());
        return H.map(row => {
            return [0, 1].map(c => {
                return row.reduce((sum, val, i) => sum + val * this.w[i][c], 0);
            });
        });
    }
}

export class Warps {
    constructor(src = [], dst = [], npoints = 0) {
        this.npoints = npoints;
        this.src = [...src, ...new Array(MAX_POINTS - src.length).fill([0, 0])];
        this.dst = [...dst, ...new Array(MAX_POINTS - dst.length).fill([0, 0])];

        this.src = this.src.map(item => {
            return Array.isArray(item) && item.length === 2 && 
                   typeof item[0] === 'number' && typeof item[1] === 'number' ? 
                   item : [0, 0];
        });

        this.dst = this.dst.map(item => {
            return Array.isArray(item) && item.length === 2 && 
                   typeof item[0] === 'number' && typeof item[1] === 'number' ? 
                   item : [0, 0];
    });

    this.warps = [
	new Warp(this, 0, this.src, this.dst),
            new Warp(this, 1, this.dst, this.src)
        ];
    }

    update() {
        this.warps.forEach(warp => warp.update());
    }

    add(sx, sy, dx, dy, flip) {
        if (flip) {
            [sx, dx] = [dx, sx];
            [sy, dy] = [dy, sy];
    }

    this.src[this.npoints] = [sx, sy];
    this.dst[this.npoints] = [dx, dy];
    this.npoints++;
    this.update();
    }

    add_pair(which, x, y) {
        const idx = which ? 1 : 0;
        const p = this.warps[idx].warp([[x, y]])[0];
        this.add(x, y, p[0], p[1], which);
    }

    delete(idx) {
        for (let i = idx; i < this.npoints - 1; i++) {
            this.src[i] = this.src[i + 1].slice();
            this.dst[i] = this.dst[i + 1].slice();
    }
    this.npoints--;
    this.update();
    }
}

export class Canvas {
    constructor(warp, canvas, colors) {
	this.warp = warp;
	this.canvas = canvas;
	this.ctx = canvas.getContext("webgl", { preserveDrawingBuffer: true });
        this.radius = 10;
        this.colors = colors;
	this.drag = null;
        this.showPoints = true;
        this.aspectRatio = this.canvas.width / this.canvas.height;
        this.colorSpace = 0; // Default to RGB
        
        // Levels adjustment properties
        this.levels = {
            low: 0.0,
            mid: 1.0,
            high: 1.0
        };
        
        // Effects properties
        this.effects = {
            type: 'none',
            pixelSize: 8,
            ditherSize: 4,
            ditherAlgorithm: 'ordered'
        };
        
        // Initialize color control points
        this.updateColorPoints();

        this.setupWebGL();
    }

    setColorSpace(space) {
        switch(space) {
            case 'rgb':
                this.colorSpace = 0;
                break;
            case 'oklab':
                this.colorSpace = 1;
                break;
            case 'hsl':
                this.colorSpace = 2;
                break;
            case 'lch':
                this.colorSpace = 3;
                break;
            default:
                this.colorSpace = 0;
        }
    }

    setLevels(low, mid, high) {
        this.levels.low = low;
        this.levels.mid = mid;
        this.levels.high = high;
    }

    setEffect(type, pixelSize = 8, ditherSize = 4, ditherAlgorithm = 'ordered') {
        this.effects.type = type;
        this.effects.pixelSize = pixelSize;
        this.effects.ditherSize = ditherSize;
        this.effects.ditherAlgorithm = ditherAlgorithm;
    }

    updateAspectRatio(newRatio) {
        this.aspectRatio = newRatio;
        this.updateColorPoints();
    }

    resizeFramebuffer() {
        const gl = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Delete existing textures
        if (this.colorTexture1) {
            gl.deleteTexture(this.colorTexture1);
        }
        if (this.colorTexture2) {
            gl.deleteTexture(this.colorTexture2);
        }

        // Recreate first texture
        this.colorTexture1 = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer1);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture1, 0);

        // Recreate second texture
        this.colorTexture2 = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture2);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer2);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture2, 0);

        // Check framebuffer completeness
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            console.error('Framebuffer not complete after resize');
        }

        // Unbind framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    updateColorPoints() {
        // Calculate bounds considering aspect ratio
        const xBound = Math.min(0.9, 0.9 * this.aspectRatio);
        const yBound = Math.min(0.9, 0.9 / this.aspectRatio);

        this.colorPoints = [
            { pos: [-xBound, yBound], type: 'color', corner: 'tl' },
            { pos: [xBound, yBound], type: 'color', corner: 'tr' },
            { pos: [-xBound, -yBound], type: 'color', corner: 'bl' },
            { pos: [xBound, -yBound], type: 'color', corner: 'br' }
        ];
    }

    setupWebGL() {
        this.setupPrograms();
        this.setupBuffers();
        this.setupEventListeners();
    }

    setupPrograms() {
        this.warpProgram = this.createProgram('warp', VERTEX_SHADER, FRAGMENT_SHADER);
        this.pointProgram = this.createProgram('points', POINT_VERTEX_SHADER, POINT_FRAGMENT_SHADER);
        this.levelsProgram = this.createProgram('levels', POST_VERTEX_SHADER, LEVELS_FRAGMENT_SHADER);
        this.pixelateProgram = this.createProgram('pixelate', POST_VERTEX_SHADER, PIXELATE_FRAGMENT_SHADER);
        this.ditherProgram = this.createProgram('dither', POST_VERTEX_SHADER, DITHER_FRAGMENT_SHADER);
    }

    createProgram(name, vertexSource, fragmentSource) {
        const gl = this.ctx;
        
        const vertexShader = this.createShader(name + '.vertex', gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.createShader(name + '.fragment', gl.FRAGMENT_SHADER, fragmentSource);

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
        }

    return program;
    }

    createShader(name, type, source) {
        const gl = this.ctx;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(name + ': ' + gl.getShaderInfoLog(shader));
        }

        return shader;
    }

    setupBuffers() {
        const gl = this.ctx;

        // Position buffer
        const position = new Float32Array([-1,-1, 1,-1, 1,1, -1,1]);
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, position, gl.STATIC_DRAW);

        // Texture coordinate buffer
        const texcoord = new Float32Array([0,0, 1,0, 1,1, 0,1]);
        this.texcoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, texcoord, gl.STATIC_DRAW);

        // Points buffer
        this.pointsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.pointsBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, MAX_POINTS * 2 * 4, gl.STATIC_DRAW);

        // Index buffer
	this.indices = new Uint16Array([0,1,2, 2,3,0]);
        this.numIndices = this.indices.length;
        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);

        // Setup framebuffer for post-processing
        this.setupFramebuffer();

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }

    setupFramebuffer() {
        const gl = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Create first framebuffer (for initial render)
        this.framebuffer1 = gl.createFramebuffer();
        this.colorTexture1 = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer1);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture1, 0);

        // Create second framebuffer (for post-processing)
        this.framebuffer2 = gl.createFramebuffer();
        this.colorTexture2 = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture2);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer2);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture2, 0);

        // Check framebuffer completeness
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            console.error('Framebuffer not complete');
        }

        // Unbind framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
        
        // Touch events for mobile support
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        
        // Track double tap for mobile
        this.lastTouchTime = 0;
        this.touchTimeout = null;
    }

    handleDoubleClick(event) {
        if (event.button !== 0) return;

        const rect = this.canvas.getBoundingClientRect();
        const [x, y] = this.getCanvasCoordinates(event, rect);
        const point = this.findPoint(x, y, rect);

        if (point && point.type === 'warp') {
            this.warp.parent.delete(point.index);
            this.draw();
        }
    }

    setUniform(program, variable, func, type, value) {
        const gl = this.ctx;
        const loc = gl.getUniformLocation(program, variable);
        
        if (type === 0) {
	func.call(gl, loc, value);
        } else if (type === 1) {
	func.call(gl, loc, new Float32Array(value));
        } else {
            throw new Error('Invalid uniform type');
        }
    }

    draw() {
        const gl = this.ctx;

        // First pass: Render gradient to framebuffer1 (no points)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer1);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        
        gl.clearColor(0.5, 0.5, 1.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        if (this.warp.npoints() >= 4) {
            this.drawMesh();
        }

        // Second pass: Apply levels adjustment to framebuffer2
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer2);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        
        this.applyLevels();

        // Third pass: Apply effects to screen (or intermediate buffer)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        
        this.applyEffects();

        // Fourth pass: Draw control points on top (directly to screen)
        if (this.showPoints && this.warp.npoints() > 0) {
            this.drawPoints();
        }

        gl.flush();
    }

    applyLevels() {
        const gl = this.ctx;
        
        // Use the levels shader program
        gl.useProgram(this.levelsProgram);
        
        // Clear the screen
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Bind the rendered texture from framebuffer1
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture1);
        
        // Set uniforms
        this.setUniform(this.levelsProgram, 'u_Texture', gl.uniform1i, 0, 0);
        this.setUniform(this.levelsProgram, 'u_LevelsLow', gl.uniform1f, 0, this.levels.low);
        this.setUniform(this.levelsProgram, 'u_LevelsMid', gl.uniform1f, 0, this.levels.mid);
        this.setUniform(this.levelsProgram, 'u_LevelsHigh', gl.uniform1f, 0, this.levels.high);
        
        // Set up attributes for fullscreen quad
        const positionAttrib = gl.getAttribLocation(this.levelsProgram, "a_Position");
        const texcoordAttrib = gl.getAttribLocation(this.levelsProgram, "a_TexCoord");
        
        // Position attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);
        
        // Texture coordinate attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
        gl.enableVertexAttribArray(texcoordAttrib);
        gl.vertexAttribPointer(texcoordAttrib, 2, gl.FLOAT, false, 0, 0);
        
        // Draw fullscreen quad
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.drawElements(gl.TRIANGLES, this.numIndices, gl.UNSIGNED_SHORT, 0);
        
        // Clean up
        gl.disableVertexAttribArray(positionAttrib);
        gl.disableVertexAttribArray(texcoordAttrib);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    applyEffects() {
        const gl = this.ctx;
        
        if (this.effects.type === 'none') {
            // No effect - just copy the levels-adjusted texture to screen
            this.copyTexture(this.colorTexture2);
        } else if (this.effects.type === 'pixelate') {
            // Apply pixelate effect
            this.applyPixelate();
        } else if (this.effects.type === 'dither') {
            // Apply dither effect
            this.applyDither();
        }
    }

    copyTexture(sourceTexture) {
        const gl = this.ctx;
        
        // Use the levels shader without any adjustment (pass-through)
        gl.useProgram(this.levelsProgram);
        
        // Clear the screen
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Bind the source texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
        
        // Set uniforms for pass-through (no levels adjustment)
        this.setUniform(this.levelsProgram, 'u_Texture', gl.uniform1i, 0, 0);
        this.setUniform(this.levelsProgram, 'u_LevelsLow', gl.uniform1f, 0, 0.0);
        this.setUniform(this.levelsProgram, 'u_LevelsMid', gl.uniform1f, 0, 1.0);
        this.setUniform(this.levelsProgram, 'u_LevelsHigh', gl.uniform1f, 0, 1.0);
        
        this.renderFullscreenQuad(this.levelsProgram);
    }

    applyPixelate() {
        const gl = this.ctx;
        
        // Use the pixelate shader program
        gl.useProgram(this.pixelateProgram);
        
        // Clear the screen
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Bind the levels-adjusted texture from framebuffer2
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture2);
        
        // Set uniforms
        this.setUniform(this.pixelateProgram, 'u_Texture', gl.uniform1i, 0, 0);
        this.setUniform(this.pixelateProgram, 'u_PixelSize', gl.uniform1f, 0, this.effects.pixelSize);
        
        // Set resolution uniform directly (uniform2f needs separate x, y values)
        const resolutionLoc = gl.getUniformLocation(this.pixelateProgram, 'u_Resolution');
        gl.uniform2f(resolutionLoc, this.canvas.width, this.canvas.height);
        
        this.renderFullscreenQuad(this.pixelateProgram);
    }

    applyDither() {
        const gl = this.ctx;
        
        // Use the dither shader program
        gl.useProgram(this.ditherProgram);
        
        // Clear the screen
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Bind the levels-adjusted texture from framebuffer2
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture2);
        
        // Set basic uniforms
        this.setUniform(this.ditherProgram, 'u_Texture', gl.uniform1i, 0, 0);
        this.setUniform(this.ditherProgram, 'u_DitherSize', gl.uniform1f, 0, this.effects.ditherSize);
        
        // Set resolution uniform directly
        const resolutionLoc = gl.getUniformLocation(this.ditherProgram, 'u_Resolution');
        gl.uniform2f(resolutionLoc, this.canvas.width, this.canvas.height);
        
        // Set algorithm uniform
        const algorithmMap = { 'ordered': 0, 'floyd': 1, 'atkinson': 2 };
        const algorithmLoc = gl.getUniformLocation(this.ditherProgram, 'u_Algorithm');
        gl.uniform1i(algorithmLoc, algorithmMap[this.effects.ditherAlgorithm] || 0);
        
        // Set color uniforms (the 4 user colors)
        const hexToRGBA = hex => {
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            return [r, g, b, 1];
        };
        
        // Get colors from corner positions
        const colors = [
            this.colors.tl, // Top-left
            this.colors.tr, // Top-right
            this.colors.bl, // Bottom-left
            this.colors.br  // Bottom-right
        ];
        
        colors.forEach((color, index) => {
            const uniformName = `u_Color${index + 1}`;
            const colorLoc = gl.getUniformLocation(this.ditherProgram, uniformName);
            const rgba = hexToRGBA(color);
            gl.uniform4f(colorLoc, rgba[0], rgba[1], rgba[2], rgba[3]);
        });
        
        this.renderFullscreenQuad(this.ditherProgram);
    }

    renderFullscreenQuad(program) {
        const gl = this.ctx;
        
        // Set up attributes for fullscreen quad
        const positionAttrib = gl.getAttribLocation(program, "a_Position");
        const texcoordAttrib = gl.getAttribLocation(program, "a_TexCoord");
        
        // Position attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);
        
        // Texture coordinate attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
        gl.enableVertexAttribArray(texcoordAttrib);
        gl.vertexAttribPointer(texcoordAttrib, 2, gl.FLOAT, false, 0, 0);
        
        // Draw fullscreen quad
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.drawElements(gl.TRIANGLES, this.numIndices, gl.UNSIGNED_SHORT, 0);
        
        // Clean up
        gl.disableVertexAttribArray(positionAttrib);
        gl.disableVertexAttribArray(texcoordAttrib);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    drawMesh() {
        const gl = this.ctx;
        gl.useProgram(this.warpProgram);

        // Set uniforms
        this.setUniform(this.warpProgram, 'warp', gl.uniform1i, 0, this.warp.which);
        this.setUniform(this.warpProgram, 'npoints', gl.uniform1i, 0, this.warp.npoints());
        this.setUniform(this.warpProgram, 'aspectRatio', gl.uniform1f, 0, this.aspectRatio);
        this.setUniform(this.warpProgram, 'colorSpace', gl.uniform1i, 0, this.colorSpace);
        
        // Flatten the points array and ensure it's properly formatted
        const points = this.warp.src.slice(0, this.warp.npoints()).flat();
        this.setUniform(this.warpProgram, 'points', gl.uniform2fv, 1, points);
        
        // Ensure s2 array is properly formatted
        const s2 = this.warp.s2.slice(0, this.warp.npoints());
        this.setUniform(this.warpProgram, 's2', gl.uniform1fv, 1, s2);
        
        // Flatten the weights array and ensure it's properly formatted
        const weights = this.warp.w.slice(0, this.warp.npoints()).flat();
        this.setUniform(this.warpProgram, 'w', gl.uniform2fv, 1, weights);

        // Set color uniforms
        const hexToRGBA = hex => {
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            return [r, g, b, 1];
        };

        // Set colors and color positions
        this.colorPoints.forEach((point, index) => {
            const colorUniform = `u_color${index + 1}`;
            const posUniform = `colorPos${index + 1}`;
            const color = this.colors[point.corner];
            
            this.setUniform(this.warpProgram, colorUniform, gl.uniform4fv, 1, hexToRGBA(color));
            this.setUniform(this.warpProgram, posUniform, gl.uniform2fv, 1, point.pos);
        });

        // Set attributes
        const positionAttrib = gl.getAttribLocation(this.warpProgram, "a_Position");
        const texcoordAttrib = gl.getAttribLocation(this.warpProgram, "a_TexCoord");

        gl.enableVertexAttribArray(positionAttrib);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.enableVertexAttribArray(texcoordAttrib);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
        gl.vertexAttribPointer(texcoordAttrib, 2, gl.FLOAT, false, 0, 0);

        // Draw
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.drawElements(gl.TRIANGLES, this.numIndices, gl.UNSIGNED_SHORT, 0);

        // Cleanup
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        gl.disableVertexAttribArray(positionAttrib);
        gl.disableVertexAttribArray(texcoordAttrib);
	gl.useProgram(null);
    }

    drawPoints() {
        const gl = this.ctx;
        gl.useProgram(this.pointProgram);

        const positionAttrib = gl.getAttribLocation(this.pointProgram, "a_Position");

        // Draw warp points in black
        this.setUniform(this.pointProgram, 'radius', gl.uniform1f, 0, 10.0);
        this.setUniform(this.pointProgram, 'color', gl.uniform3fv, 0, [0, 0, 0]);

        const coords = this.warp.get_src();
        gl.enableVertexAttribArray(positionAttrib);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.pointsBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(coords.flat()));
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.POINTS, 0, coords.length);

        // Draw color control points
        this.setUniform(this.pointProgram, 'radius', gl.uniform1f, 0, 15.0);
        
        // Draw each color point
        this.colorPoints.forEach(point => {
            const color = this.colors[point.corner];
            const rgb = this.hexToRGB(color);
            this.setUniform(this.pointProgram, 'color', gl.uniform3fv, 0, rgb);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(point.pos));
            gl.drawArrays(gl.POINTS, 0, 1);
        });

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.disableVertexAttribArray(positionAttrib);
        gl.useProgram(null);
    }

    hexToRGB(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return [r, g, b];
    }

    handleMouseDown(event) {
        if (event.button !== 0) return;

        const rect = this.canvas.getBoundingClientRect();
        const [x, y] = this.getCanvasCoordinates(event, rect);
        const point = this.findPoint(x, y, rect);

        if (!point) {
            // Add a single warp point
            this.warp.parent.add_pair(this.warp.which, x, y);
        } else if (point.type === 'warp') {
            if (event.shiftKey) {
                this.warp.parent.delete(point.index);
            } else {
                const p = this.warp.src[point.index];
                this.drag = { 
                    type: 'warp',
                    index: point.index, 
                    startX: x, 
                    startY: y, 
                    origX: p[0], 
                    origY: p[1] 
                };
            }
        } else if (point.type === 'color') {
            const colorPoint = this.colorPoints.find(p => p.corner === point.corner);
            if (!colorPoint) {
                console.error('Color point not found:', point.corner);
	return;
            }
            
            this.drag = {
                type: 'color',
                corner: point.corner,
                startX: x,
                startY: y,
                origPos: colorPoint.pos.slice()
            };
        }

        this.draw();
    }

    handleMouseMove(event) {
        if (event.button !== 0 || !this.drag) return;

        const rect = this.canvas.getBoundingClientRect();
        const [x, y] = this.getCanvasCoordinates(event, rect);

        if (this.drag.type === 'warp') {
            const dx = x - this.drag.startX;
            const dy = y - this.drag.startY;
            
            this.warp.src[this.drag.index] = [
                this.drag.origX + dx,
                this.drag.origY + dy
            ];

            this.warp.parent.update();
        } else if (this.drag.type === 'color') {
            const dx = x - this.drag.startX;
            const dy = y - this.drag.startY;
            
            // Calculate new position
            let newX = this.drag.origPos[0] + dx;
            let newY = this.drag.origPos[1] + dy;
            
            // Constrain to edges with aspect ratio consideration
            const xBound = Math.min(0.95, 0.95 * this.aspectRatio);
            const yBound = Math.min(0.95, 0.95 / this.aspectRatio);
            
            newX = Math.max(-xBound, Math.min(xBound, newX));
            newY = Math.max(-yBound, Math.min(yBound, newY));
            
            // Update color point position
            const point = this.colorPoints.find(p => p.corner === this.drag.corner);
            point.pos = [newX, newY];
        }

        this.draw();
    }

    handleMouseUp(event) {
        if (event.button !== 0 || !this.drag) return;

        if (this.drag.type === 'warp') {
            this.warp.parent.update();
        }
        
        this.drag = null;
        this.draw();
    }

    handleTouchStart(event) {
        event.preventDefault(); // Prevent scrolling and zooming
        
        if (event.touches.length !== 1) return; // Only handle single touch

        const rect = this.canvas.getBoundingClientRect();
        const [x, y] = this.getCanvasCoordinates(event, rect);
        const point = this.findPoint(x, y, rect);

        // Handle double tap detection for removing warp points
        const currentTime = Date.now();
        const timeDiff = currentTime - this.lastTouchTime;
        
        if (timeDiff < 300 && point && point.type === 'warp') {
            // Double tap detected on warp point - delete it
            this.warp.parent.delete(point.index);
            this.draw();
            this.lastTouchTime = 0; // Reset to prevent triple tap issues
            return;
        }
        
        this.lastTouchTime = currentTime;

        if (!point) {
            // Add a single warp point
            this.warp.parent.add_pair(this.warp.which, x, y);
        } else if (point.type === 'warp') {
            const p = this.warp.src[point.index];
            this.drag = { 
                type: 'warp',
                index: point.index, 
                startX: x, 
                startY: y, 
                origX: p[0], 
                origY: p[1] 
            };
        } else if (point.type === 'color') {
            const colorPoint = this.colorPoints.find(p => p.corner === point.corner);
            if (!colorPoint) {
                console.error('Color point not found:', point.corner);
                return;
            }
            
            this.drag = {
                type: 'color',
                corner: point.corner,
                startX: x,
                startY: y,
                origPos: colorPoint.pos.slice()
            };
        }

        this.draw();
    }

    handleTouchMove(event) {
        event.preventDefault(); // Prevent scrolling
        
        if (event.touches.length !== 1 || !this.drag) return; // Only handle single touch

        const rect = this.canvas.getBoundingClientRect();
        const [x, y] = this.getCanvasCoordinates(event, rect);

        if (this.drag.type === 'warp') {
            const dx = x - this.drag.startX;
            const dy = y - this.drag.startY;
            
            this.warp.src[this.drag.index] = [
                this.drag.origX + dx,
                this.drag.origY + dy
            ];

            this.warp.parent.update();
        } else if (this.drag.type === 'color') {
            const dx = x - this.drag.startX;
            const dy = y - this.drag.startY;
            
            // Calculate new position
            let newX = this.drag.origPos[0] + dx;
            let newY = this.drag.origPos[1] + dy;
            
            // Constrain to edges with aspect ratio consideration
            const xBound = Math.min(0.95, 0.95 * this.aspectRatio);
            const yBound = Math.min(0.95, 0.95 / this.aspectRatio);
            
            newX = Math.max(-xBound, Math.min(xBound, newX));
            newY = Math.max(-yBound, Math.min(yBound, newY));
            
            // Update color point position
            const point = this.colorPoints.find(p => p.corner === this.drag.corner);
            point.pos = [newX, newY];
        }

        this.draw();
    }

    handleTouchEnd(event) {
        event.preventDefault();
        
        if (!this.drag) return;

        if (this.drag.type === 'warp') {
            this.warp.parent.update();
        }
        
        this.drag = null;
        this.draw();
    }

    getCanvasCoordinates(event, rect) {
        // Convert screen coordinates to clip space (-1 to 1)
        let clientX, clientY;
        
        if (event.touches && event.touches.length > 0) {
            // Touch event
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        } else if (event.changedTouches && event.changedTouches.length > 0) {
            // Touch end event
            clientX = event.changedTouches[0].clientX;
            clientY = event.changedTouches[0].clientY;
        } else {
            // Mouse event
            clientX = event.clientX;
            clientY = event.clientY;
        }
        
        const x = (clientX - rect.left) / rect.width * 2 - 1;
        const y = -(clientY - rect.top) / rect.height * 2 + 1;
        return [x, y];
    }

    findPoint(x, y, rect) {
        // Calculate hit test radius in clip space
        const hitRadius = 0.05; // Base radius in clip space (-1 to 1)
        const colorHitRadius = hitRadius * 1.5;

        // Check color points first (they're on top)
        for (const point of this.colorPoints) {
            const dx = point.pos[0] - x;
            const dy = point.pos[1] - y;
            const dist2 = dx * dx + dy * dy;
            
            if (dist2 <= colorHitRadius * colorHitRadius) {
                return { type: 'color', corner: point.corner };
            }
        }

        // Then check warp points
        const coords = this.warp.get_src();
        for (let i = 0; i < this.warp.npoints(); i++) {
            const px = coords[i][0];
            const py = coords[i][1];
            const dx = px - x;
            const dy = py - y;
            const dist2 = dx * dx + dy * dy;
            
            if (dist2 <= hitRadius * hitRadius) {
                return { type: 'warp', index: i };
            }
        }

        return null;
    }

    randomizeColorPositions() {
        const xBound = Math.min(0.8, 0.8 * this.aspectRatio);
        const yBound = Math.min(0.8, 0.8 / this.aspectRatio);

        this.colorPoints.forEach(point => {
            point.pos = [
                (-xBound + Math.random() * (2 * xBound)),
                (-yBound + Math.random() * (2 * yBound))
            ];
        });
    }
}

// Helper function for solving linear equations
function linsolve(A, b) {
    const rows = A.length;
    const cols = A[0].length;
    const bcols = b[0].length;

    // Forward elimination
    for (let c = 0; c < cols - 1; c++) {
        let maxRow = c;
        let maxVal = Math.abs(A[c][c]);

        for (let r = c + 1; r < rows; r++) {
            const absVal = Math.abs(A[r][c]);
            if (absVal > maxVal) {
                maxVal = absVal;
                maxRow = r;
            }
        }

        if (maxRow !== c) {
            [A[c], A[maxRow]] = [A[maxRow], A[c]];
            [b[c], b[maxRow]] = [b[maxRow], b[c]];
        }

        for (let r = c + 1; r < rows; r++) {
            const factor = A[r][c] / A[c][c];
            for (let i = c; i < cols; i++) {
                A[r][i] -= factor * A[c][i];
            }
            for (let i = 0; i < bcols; i++) {
                b[r][i] -= factor * b[c][i];
            }
        }
    }

    // Back substitution
    for (let r = rows - 1; r >= 0; r--) {
        for (let c = r + 1; c < cols; c++) {
            for (let i = 0; i < bcols; i++) {
                b[r][i] -= A[r][c] * b[c][i];
            }
        }
        for (let i = 0; i < bcols; i++) {
            b[r][i] /= A[r][r];
        }
    }

    return b;
}

// ************************************************************

function redraw()
{
    window.requestAnimationFrame(src_c.draw.bind(src_c));
    window.requestAnimationFrame(dst_c.draw.bind(dst_c));
    window.requestAnimationFrame(clone.draw.bind(clone));
};

function adjust() {
    const b = document.querySelector('.body');
    const c = document.getElementById("canvas1");
    const c2 = document.getElementById("canvas2");
    const r = c.getBoundingClientRect();
    const r2 = c2.getBoundingClientRect();
    const bo = b.getBoundingClientRect();
    const radius = Math.min(bo.height, (bo.width / 2) - 16);
    c.width = radius;
    c.height = radius;
    c2.width = radius;
    c2.height = radius;
}

let tut = 0;
function nextTut() {
    if (tut === 0) {
        document.querySelector('.t1').style.opacity = 0;
        document.querySelector('.t2').style.opacity = 1;
        document.querySelector('#tut2').style = "z-index: 10";
        document.querySelector('#tut1').style = "z-index: 0";
    } else if (tut === 1) {
        document.querySelector('.tutorial').classList.remove('visible');
        localStorage.setItem('user', true)
    }
    tut +=1;
}
const user = false && localStorage.getItem('user');

window.addEventListener('resize', adjust)
let clone;

function startTut() {
    document.querySelector('#welcome').classList.remove('visible');
    const tutorial = document.querySelector('.tutorial');
    const t1 = document.querySelector('#tut1');
    const t2 = document.querySelector('#tut2');
    tutorial.classList.add('visible');
    t1.style = "z-index: 1;"
}
function init(){
    dialogPolyfill.registerDialog(document.getElementById("info-dialog"));

    const exportbtn = document.querySelector('.export-btn');

    exportbtn.addEventListener('click', () => {
        exportbtn.href = document.getElementById("canvas3").toDataURL();
        exportbtn.download = 'mesh-gradient.png';
    });

    const wrap = document.querySelector('.gallery__wrapper');

    
    adjust();

    if (!user) {
        document.querySelector('#welcome').classList.add('visible');
    }

    
    const urlParams = new URLSearchParams(window.location.search);
    const o = urlParams.get('w')? JSON.parse(window.atob(urlParams.get('w'))) : {};
    if (urlParams.get('c')) {
        try {
            const l = JSON.parse(window.atob(urlParams.get('c')));
            colors = l;
        } catch (e) {
            console.log('err', e)
        }
    }
    updateColors();
    warps = new Warps(o.s ? o.s.slice(0, o.p) : [], o.d ? o.d.slice(0, o.p) : [], o.p);
    src_c = new Canvas(warps.warps[0], document.getElementById("canvas1"), colors);
    dst_c = new Canvas(warps.warps[1], document.getElementById("canvas2"), colors);
    clone = new Canvas(warps.warps[1], document.getElementById("canvas3"), colors);
    console.log(o)
    const addDefault = () => {
        var pairs = [[-0.85, -0.9], [-0.95, 0.9], [0.85, -0.9], [0.95, 0.9]];
        for (var i = 0; i < pairs.length; i++) {
            var x = pairs[i][0];
            var y = pairs[i][1];
            warps.add_pair(0, x, y);
        }
    }
    
    if (!urlParams.get('w')) {
        addDefault();
    }

    
    
    
    warps.update();

    redraw();
}

function changeColor(e) {
    colors[e.target.getAttribute('data-gradient')] = e.target.value;
    updateUrl();
    redraw();
}

function updateColors() {
    const b = document.querySelector('.btn-group');
    b.innerHTML = '';
    Object.keys(colors).forEach(side => {
        const color = colors[side]
        const i = document.createElement("INPUT");
        i.value = color;
        i.type = 'color';
        i.addEventListener('change', changeColor);
        i.setAttribute('data-gradient', side);
        b.appendChild(i);
    })
}

let infoToggled = false;



