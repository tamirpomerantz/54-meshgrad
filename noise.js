export class NoiseRenderer {
    constructor(webglCanvas) {
        this.webglCanvas = webglCanvas;
        this.enabled = false;
        this.noiseCanvas = null;
        this.noiseCtx = null;
        this.noiseGenerated = false; // Track if noise has been generated
        this.setupNoiseCanvas();
    }

    setupNoiseCanvas() {
        // Create a 2D canvas overlay for noise
        this.noiseCanvas = document.createElement('canvas');
        this.noiseCanvas.style.position = 'absolute';
        this.noiseCanvas.style.top = '0';
        this.noiseCanvas.style.left = '0';
        this.noiseCanvas.style.pointerEvents = 'none'; // Allow clicks to pass through
        this.noiseCanvas.style.mixBlendMode = 'overlay';
        this.noiseCanvas.style.opacity = '0.1';
        this.noiseCanvas.style.zIndex = '1';
        
        this.noiseCtx = this.noiseCanvas.getContext('2d');
        
        // Add to the same parent as the WebGL canvas
        if (this.webglCanvas.parentNode) {
            this.webglCanvas.parentNode.appendChild(this.noiseCanvas);
        }
        
        this.updateCanvasSize();
        this.updateVisibility();
    }

    updateCanvasSize() {
        if (!this.noiseCanvas || !this.webglCanvas) return;
        
        this.noiseCanvas.width = this.webglCanvas.width;
        this.noiseCanvas.height = this.webglCanvas.height;
        this.noiseCanvas.style.width = this.webglCanvas.style.width || this.webglCanvas.width + 'px';
        this.noiseCanvas.style.height = this.webglCanvas.style.height || this.webglCanvas.height + 'px';
        
        // Mark noise as needing regeneration due to size change
        this.noiseGenerated = false;
    }

    generateNoise() {
        if (!this.noiseCtx) return;

        const width = this.noiseCanvas.width;
        const height = this.noiseCanvas.height;
        
        // Create ImageData for pixel manipulation
        const imageData = this.noiseCtx.createImageData(width, height);
        const data = imageData.data;

        // Generate random black/white noise
        for (let i = 0; i < data.length; i += 4) {
            // Random value: either 0 (black) or 255 (white)
            const value = Math.random() > 0.5 ? 255 : 0;
            
            data[i] = value;     // Red
            data[i + 1] = value; // Green
            data[i + 2] = value; // Blue
            data[i + 3] = 255;   // Alpha (fully opaque)
        }

        // Put the noise data onto the noise canvas
        this.noiseCtx.putImageData(imageData, 0, 0);
        this.noiseGenerated = true; // Mark as generated
    }

    applyNoise() {
        if (!this.enabled) return;

        // Generate noise only once, or if canvas size changed
        if (!this.noiseGenerated) {
            this.generateNoise();
        }
    }

    updateVisibility() {
        if (!this.noiseCanvas) return;
        
        this.noiseCanvas.style.display = this.enabled ? 'block' : 'none';
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        
        if (this.enabled) {
            this.updateCanvasSize();
            // Generate noise when first enabled
            if (!this.noiseGenerated) {
                this.generateNoise();
            }
        }
        
        this.updateVisibility();
    }

    isEnabled() {
        return this.enabled;
    }

    // Call this after canvas resize
    onResize() {
        this.updateCanvasSize();
        // updateCanvasSize() already marks noise as needing regeneration
        // It will be regenerated on next applyNoise() call if enabled
    }

    // Clean up when destroying
    destroy() {
        if (this.noiseCanvas && this.noiseCanvas.parentNode) {
            this.noiseCanvas.parentNode.removeChild(this.noiseCanvas);
        }
    }
} 