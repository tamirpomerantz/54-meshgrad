import { Warps, Canvas } from './mesh.js';
import { VERTEX_SHADER, FRAGMENT_SHADER, POINT_VERTEX_SHADER, POINT_FRAGMENT_SHADER } from './shaders.js';
import ColorPalette from './colorPalette.js';
import { NoiseRenderer } from './noise.js';

class MeshGradientApp {
    constructor() {
        this.colors = ColorPalette.generate();
        this.colorSpace = 'rgb'; // Default color space
        
        this.canvas = null;
        this.ctx = null;
        this.warps = null;
        this.meshCanvas = null;
        this.noiseRenderer = null;

        // Animation properties
        this.isAnimating = false;
        this.animationId = null;
        this.pointVelocities = []; // Velocities for warp points
        this.colorPointVelocities = []; // Velocities for color points
        this.animationSpeed = 0.002; // Low speed as requested

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        this.canvas = document.getElementById('meshCanvas');
        if (!this.canvas) {
            console.error('Canvas element not found');
            return;
        }

        this.ctx = this.canvas.getContext('webgl', { preserveDrawingBuffer: true });
        this.noiseRenderer = new NoiseRenderer(this.canvas);
        this.initializeUI();
        this.setupEventListeners();
        this.initializeMesh();
        this.resizeCanvas();
    }

    initializeUI() {
        // Initialize color pickers
        Object.entries(this.colors).forEach(([position, color]) => {
            const input = document.querySelector(`[data-position="${position}"]`);
            if (input) {
                input.value = color;
                // Set initial icon color
                const icon = input.nextElementSibling?.querySelector('.material-icons-round');
                if (icon) {
                    icon.style.color = color;
                }
            }
        });

        // Set canvas size
        this.resizeCanvas();
    }

    setupEventListeners() {
        // Toggle controls
        document.querySelector('.toggle-controls')?.addEventListener('click', () => {
            document.querySelector('.controls-panel').classList.toggle('collapsed');
        });

        // Color space selector
        document.getElementById('colorSpace')?.addEventListener('change', (e) => {
            this.colorSpace = e.target.value;
            if (this.meshCanvas) {
                this.meshCanvas.setColorSpace(this.colorSpace);
                this.redraw();
            }
        });

        // Animation toggle
        document.getElementById('toggleAnimation')?.addEventListener('click', (e) => {
            this.toggleAnimation();
            
            // Update button appearance and icon
            const button = e.currentTarget;
            const icon = button.querySelector('.material-icons-round');
            if (this.isAnimating) {
                button.classList.add('active');
                icon.textContent = 'pause';
            } else {
                button.classList.remove('active');
                icon.textContent = 'play_arrow';
            }
        });

        // Noise toggle
        document.getElementById('toggleNoise')?.addEventListener('click', (e) => {
            const isEnabled = !this.noiseRenderer.isEnabled();
            this.noiseRenderer.setEnabled(isEnabled);
            
            // Update button appearance
            const button = e.currentTarget;
            if (isEnabled) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
            
            this.redraw();
        });

        // Color picker events
        document.querySelectorAll('input[type="color"]').forEach(input => {
            input.addEventListener('change', (e) => {
                const position = e.target.dataset.position;
                const newColor = e.target.value;
                this.colors[position] = newColor;
                
                // Update icon color
                const icon = input.nextElementSibling?.querySelector('.material-icons-round');
                if (icon) {
                    icon.style.color = newColor;
                }

                if (this.meshCanvas) {
                    this.meshCanvas.colors = this.colors;
                    this.redraw();
                }
            });

            // Set initial icon colors
            const icon = input.nextElementSibling?.querySelector('.material-icons-round');
            if (icon) {
                icon.style.color = input.value;
            }
        });

        // Levels slider events
        const levelsSliders = ['levelsLow', 'levelsMid', 'levelsHigh'];
        levelsSliders.forEach(sliderId => {
            const slider = document.getElementById(sliderId);
            const valueDisplay = slider?.nextElementSibling;
            
            if (slider) {
                slider.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value);
                    
                    // Update value display
                    if (valueDisplay) {
                        if (sliderId === 'levelsMid') {
                            valueDisplay.textContent = value.toFixed(1);
                        } else {
                            valueDisplay.textContent = value.toFixed(2);
                        }
                    }
                    
                    // Update levels in canvas
                    if (this.meshCanvas) {
                        const low = parseFloat(document.getElementById('levelsLow').value);
                        const mid = parseFloat(document.getElementById('levelsMid').value);
                        const high = parseFloat(document.getElementById('levelsHigh').value);
                        
                        this.meshCanvas.setLevels(low, mid, high);
                        this.redraw();
                    }
                });
            }
        });

        // Effects dropdown event
        document.getElementById('effectType')?.addEventListener('change', (e) => {
            const effectType = e.target.value;
            const pixelateOptions = document.getElementById('pixelateOptions');
            const ditherOptions = document.getElementById('ditherOptions');
            const rainbowOptions = document.getElementById('rainbowOptions');
            
            // Show/hide controls based on effect type
            if (effectType === 'pixelate') {
                pixelateOptions.style.display = 'block';
                ditherOptions.style.display = 'none';
                rainbowOptions.style.display = 'none';
            } else if (effectType === 'dither') {
                pixelateOptions.style.display = 'none';
                ditherOptions.style.display = 'block';
                rainbowOptions.style.display = 'none';
            } else if (effectType === 'rainbow') {
                pixelateOptions.style.display = 'none';
                ditherOptions.style.display = 'none';
                rainbowOptions.style.display = 'block';
            } else {
                pixelateOptions.style.display = 'none';
                ditherOptions.style.display = 'none';
                rainbowOptions.style.display = 'none';
            }
            
            // Update effect in canvas
            if (this.meshCanvas) {
                const pixelSize = parseFloat(document.getElementById('pixelSize').value);
                const ditherSize = parseFloat(document.getElementById('ditherSize').value);
                const ditherAlgorithm = document.getElementById('ditherAlgorithm').value;
                const rainbowIntensity = parseFloat(document.getElementById('rainbowIntensity').value);
                this.meshCanvas.setEffect(effectType, pixelSize, ditherSize, ditherAlgorithm, rainbowIntensity);
                this.redraw();
            }
        });

        // Pixel size slider event
        const pixelSizeSlider = document.getElementById('pixelSize');
        const pixelValueDisplay = pixelSizeSlider?.nextElementSibling;
        
        if (pixelSizeSlider) {
            pixelSizeSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                
                // Update value display
                if (pixelValueDisplay) {
                    pixelValueDisplay.textContent = value.toString();
                }
                
                // Update effect in canvas
                if (this.meshCanvas) {
                    const effectType = document.getElementById('effectType').value;
                    const ditherSize = parseFloat(document.getElementById('ditherSize').value);
                    const ditherAlgorithm = document.getElementById('ditherAlgorithm').value;
                    this.meshCanvas.setEffect(effectType, value, ditherSize, ditherAlgorithm);
                    this.redraw();
                }
            });
        }

        // Dither size slider event
        const ditherSizeSlider = document.getElementById('ditherSize');
        const ditherValueDisplay = ditherSizeSlider?.nextElementSibling;
        
        if (ditherSizeSlider) {
            ditherSizeSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                
                // Update value display
                if (ditherValueDisplay) {
                    ditherValueDisplay.textContent = value.toString();
                }
                
                // Update effect in canvas
                if (this.meshCanvas) {
                    const effectType = document.getElementById('effectType').value;
                    const pixelSize = parseFloat(document.getElementById('pixelSize').value);
                    const ditherAlgorithm = document.getElementById('ditherAlgorithm').value;
                    this.meshCanvas.setEffect(effectType, pixelSize, value, ditherAlgorithm);
                    this.redraw();
                }
            });
        }

        // Dither algorithm dropdown event
        document.getElementById('ditherAlgorithm')?.addEventListener('change', (e) => {
            const algorithm = e.target.value;
            
            // Update effect in canvas
            if (this.meshCanvas) {
                const effectType = document.getElementById('effectType').value;
                const pixelSize = parseFloat(document.getElementById('pixelSize').value);
                const ditherSize = parseFloat(document.getElementById('ditherSize').value);
                const rainbowIntensity = parseFloat(document.getElementById('rainbowIntensity').value);
                this.meshCanvas.setEffect(effectType, pixelSize, ditherSize, algorithm, rainbowIntensity);
                this.redraw();
            }
        });

        // Rainbow intensity slider event
        const rainbowIntensitySlider = document.getElementById('rainbowIntensity');
        const rainbowValueDisplay = rainbowIntensitySlider?.nextElementSibling;
        
        if (rainbowIntensitySlider) {
            rainbowIntensitySlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                
                // Update value display
                if (rainbowValueDisplay) {
                    rainbowValueDisplay.textContent = value.toString();
                }
                
                // Update effect in canvas
                if (this.meshCanvas) {
                    const effectType = document.getElementById('effectType').value;
                    const pixelSize = parseFloat(document.getElementById('pixelSize').value);
                    const ditherSize = parseFloat(document.getElementById('ditherSize').value);
                    const ditherAlgorithm = document.getElementById('ditherAlgorithm').value;
                    this.meshCanvas.setEffect(effectType, pixelSize, ditherSize, ditherAlgorithm, value);
                    this.redraw();
                }
            });
        }

        // Background image controls
        const backgroundOpacitySlider = document.getElementById('backgroundOpacity');
        const backgroundOpacityDisplay = backgroundOpacitySlider?.nextElementSibling;
        const backgroundScaleSlider = document.getElementById('backgroundScale');
        const backgroundScaleDisplay = backgroundScaleSlider?.nextElementSibling;
        const backgroundBlendSelect = document.getElementById('backgroundBlend');
        const backgroundImageInput = document.getElementById('backgroundImage');
        const uploadBackgroundBtn = document.getElementById('uploadBackground');
        const removeBackgroundBtn = document.getElementById('removeBackground');
        const backgroundImageTile = document.getElementById('backgroundImageTile');
        const backgroundImagePreview = document.getElementById('backgroundImagePreview');
        const backgroundImageName = document.getElementById('backgroundImageName');
        const backgroundImageControls = document.getElementById('backgroundImageControls');

        // Background opacity slider
        if (backgroundOpacitySlider) {
            backgroundOpacitySlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                
                // Update value display
                if (backgroundOpacityDisplay) {
                    backgroundOpacityDisplay.textContent = value + '%';
                }
                
                // Update background opacity
                if (this.meshCanvas) {
                    this.meshCanvas.setBackgroundOpacity(value);
                    this.redraw();
                }
            });
        }

        // Background scale slider
        if (backgroundScaleSlider) {
            backgroundScaleSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                
                // Update value display
                if (backgroundScaleDisplay) {
                    backgroundScaleDisplay.textContent = value + '%';
                }
                
                // Update background scale
                if (this.meshCanvas) {
                    this.meshCanvas.setBackgroundScale(value);
                    this.redraw();
                }
            });
        }

        // Background blend mode
        if (backgroundBlendSelect) {
            backgroundBlendSelect.addEventListener('change', (e) => {
                const blendMode = e.target.value;
                
                // Update background blend mode
                if (this.meshCanvas) {
                    this.meshCanvas.setBackgroundBlendMode(blendMode);
                    this.redraw();
                }
            });
        }

        // Upload background image
        if (uploadBackgroundBtn && backgroundImageInput) {
            uploadBackgroundBtn.addEventListener('click', () => {
                backgroundImageInput.click();
            });

            backgroundImageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file && file.type === 'image/png') {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                            if (this.meshCanvas) {
                                this.meshCanvas.setBackgroundImage(img);
                                this.redraw();
                                
                                // Show image tile and controls, hide upload button
                                if (backgroundImageTile) {
                                    backgroundImageTile.style.display = 'flex';
                                }
                                if (backgroundImageControls) {
                                    backgroundImageControls.style.display = 'block';
                                }
                                if (uploadBackgroundBtn) {
                                    uploadBackgroundBtn.style.display = 'none';
                                }
                                
                                // Update image preview and name
                                if (backgroundImagePreview) {
                                    backgroundImagePreview.src = event.target.result;
                                }
                                if (backgroundImageName) {
                                    backgroundImageName.textContent = file.name;
                                }
                            }
                        };
                        img.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                } else {
                    alert('Please select a PNG image file.');
                }
            });
        }

        // Remove background image
        if (removeBackgroundBtn) {
            removeBackgroundBtn.addEventListener('click', () => {
                if (this.meshCanvas) {
                    this.meshCanvas.removeBackgroundImage();
                    this.redraw();
                    
                    // Hide image tile and controls, show upload button
                    if (backgroundImageTile) {
                        backgroundImageTile.style.display = 'none';
                    }
                    if (backgroundImageControls) {
                        backgroundImageControls.style.display = 'none';
                    }
                    if (uploadBackgroundBtn) {
                        uploadBackgroundBtn.style.display = 'flex';
                    }
                    
                    // Clear file input
                    if (backgroundImageInput) {
                        backgroundImageInput.value = '';
                    }
                }
            });
        }

        // Collapse/expand functionality
        const toggleSection = (targetId) => {
            const targetContent = document.getElementById(targetId);
            const collapseBtn = document.querySelector(`[data-target="${targetId}"]`);
            const isCollapsed = targetContent.classList.contains('collapsed');
            
            if (isCollapsed) {
                // Expand
                targetContent.classList.remove('collapsed');
                collapseBtn.classList.remove('collapsed');
            } else {
                // Collapse
                targetContent.classList.add('collapsed');
                collapseBtn.classList.add('collapsed');
            }
        };

        // Handle clicks on collapse buttons
        document.querySelectorAll('.collapse-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent title row click
                const targetId = e.currentTarget.getAttribute('data-target');
                toggleSection(targetId);
            });
        });

        // Handle clicks on title rows
        document.querySelectorAll('.background-title').forEach(titleRow => {
            titleRow.addEventListener('click', (e) => {
                const collapseBtn = titleRow.querySelector('.collapse-btn');
                if (collapseBtn) {
                    const targetId = collapseBtn.getAttribute('data-target');
                    toggleSection(targetId);
                }
            });
        });

        // Button events
        document.getElementById('randomizeWarp')?.addEventListener('click', () => this.randomizeWarpPoints());
        document.getElementById('randomizeColors')?.addEventListener('click', () => this.randomizeColors());
        document.getElementById('randomizePositions')?.addEventListener('click', () => this.randomizeColorPositions());
        document.getElementById('export')?.addEventListener('click', () => this.exportImage());
        document.getElementById('reset')?.addEventListener('click', () => this.reset());

        // Window resize event
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        if (!this.canvas) return;
        
        // Get the actual window dimensions
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // Update canvas size to match window dimensions
        this.canvas.width = width;
        this.canvas.height = height;
        
        if (this.ctx) {
            // Update WebGL viewport to match new dimensions
            this.ctx.viewport(0, 0, width, height);
            
            // Update aspect ratio and resize framebuffer
            if (this.meshCanvas) {
                this.meshCanvas.updateAspectRatio(width / height);
                this.meshCanvas.resizeFramebuffer();
            }
        }

        // Update noise renderer size
        if (this.noiseRenderer) {
            this.noiseRenderer.onResize();
        }
        
        if (this.meshCanvas) {
            this.redraw();
        }
    }

    initializeMesh() {
        this.warps = new Warps();
        this.meshCanvas = new Canvas(this.warps.warps[0], this.canvas, this.colors);
        this.addDefaultPoints();
        this.resizeCanvas(); // Call resize immediately after initialization
        this.redraw();
    }

    addDefaultPoints() {
        // Create a balanced arrangement of points
        const points = [
            [-0.5, -0.5],  // Bottom left
            [-0.5, 0.5],   // Top left
            [0.5, -0.5],   // Bottom right
            [0.5, 0.5]     // Top right
        ];

        points.forEach(([x, y]) => {
            this.warps.add_pair(0, x, y);
        });
    }

    randomizeWarpPoints() {
        this.warps = new Warps();
        
        // Keep the existing canvas and color points
        const currentColorPoints = this.meshCanvas.colorPoints.slice();
        this.meshCanvas = new Canvas(this.warps.warps[0], this.canvas, this.colors);
        this.meshCanvas.colorPoints = currentColorPoints;

        // Generate random points
        const numPoints = 4; // Number of control points
        for (let i = 0; i < numPoints; i++) {
            const x = (Math.random() * 1.8 - 0.9);
            const y = (Math.random() * 1.8 - 0.9);
            this.warps.add_pair(0, x, y);
        }

        this.redraw();
    }

    randomizeColorPositions() {
        if (!this.meshCanvas) return;

        // Generate new random positions for color points
        // Keep points within safe bounds to avoid edge artifacts
        const margin = 0.2; // Keep points 20% away from edges
        const min = -0.8;
        const max = 0.8;

        this.meshCanvas.colorPoints.forEach(point => {
            point.pos = [
                min + Math.random() * (max - min),
                min + Math.random() * (max - min)
            ];
        });

        this.redraw();
    }

    randomizeColors() {
        this.colors = ColorPalette.generate();
        
        // Update color pickers and icons
        Object.entries(this.colors).forEach(([position, color]) => {
            const input = document.querySelector(`[data-position="${position}"]`);
            if (input) {
                input.value = color;
                // Update icon color
                const icon = input.nextElementSibling?.querySelector('.material-icons-round');
                if (icon) {
                    icon.style.color = color;
                }
            }
        });

        if (this.meshCanvas) {
            this.meshCanvas.colors = this.colors;
            this.redraw();
        }
    }

    exportImage() {
        if (!this.meshCanvas) return;

        // Temporarily hide points for clean export
        const originalShowPoints = this.meshCanvas.showPoints;
        this.meshCanvas.showPoints = false;
        this.meshCanvas.draw();

        // Create a temporary canvas for compositing
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = this.canvas.width;
        exportCanvas.height = this.canvas.height;
        const exportCtx = exportCanvas.getContext('2d');

        // Draw the WebGL canvas content
        exportCtx.drawImage(this.canvas, 0, 0);

        // If noise is enabled, apply it to the export
        if (this.noiseRenderer && this.noiseRenderer.isEnabled()) {
            // Use the existing noise pattern (don't generate fresh)
            // Ensure noise is generated if it hasn't been yet
            this.noiseRenderer.applyNoise();
            
            // Apply noise with overlay blend mode
            exportCtx.globalCompositeOperation = 'overlay';
            exportCtx.globalAlpha = 0.1; // Match the CSS opacity
            exportCtx.drawImage(this.noiseRenderer.noiseCanvas, 0, 0);
            
            // Reset composite operation
            exportCtx.globalCompositeOperation = 'source-over';
            exportCtx.globalAlpha = 1.0;
        }

        // Export the composited image
        exportCanvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `mesh-gradient-${Date.now()}.png`;
            link.click();
            URL.revokeObjectURL(url);
        }, 'image/png');

        // Restore original state
        this.meshCanvas.showPoints = originalShowPoints;
        this.redraw();
    }

    reset() {
        this.colors = ColorPalette.generate();
        
        // Update color pickers and icons
        Object.entries(this.colors).forEach(([position, color]) => {
            const input = document.querySelector(`[data-position="${position}"]`);
            if (input) {
                input.value = color;
                // Update icon color
                const icon = input.nextElementSibling?.querySelector('.material-icons-round');
                if (icon) {
                    icon.style.color = color;
                }
            }
        });

        // Reset levels sliders to default values
        const levelsDefaults = { levelsLow: 0, levelsMid: 1, levelsHigh: 1 };
        Object.entries(levelsDefaults).forEach(([sliderId, defaultValue]) => {
            const slider = document.getElementById(sliderId);
            const valueDisplay = slider?.nextElementSibling;
            
            if (slider) {
                slider.value = defaultValue;
                if (valueDisplay) {
                    if (sliderId === 'levelsMid') {
                        valueDisplay.textContent = defaultValue.toFixed(1);
                    } else {
                        valueDisplay.textContent = defaultValue.toFixed(2);
                    }
                }
            }
        });

        // Reset effects controls to default values
        const effectTypeSelect = document.getElementById('effectType');
        const pixelSizeSlider = document.getElementById('pixelSize');
        const pixelateOptions = document.getElementById('pixelateOptions');
        const pixelValueDisplay = pixelSizeSlider?.nextElementSibling;
        
        const ditherSizeSlider = document.getElementById('ditherSize');
        const ditherOptions = document.getElementById('ditherOptions');
        const ditherValueDisplay = ditherSizeSlider?.nextElementSibling;
        const ditherAlgorithmSelect = document.getElementById('ditherAlgorithm');
        
        const rainbowIntensitySlider = document.getElementById('rainbowIntensity');
        const rainbowOptions = document.getElementById('rainbowOptions');
        const rainbowValueDisplay = rainbowIntensitySlider?.nextElementSibling;
        
        const backgroundOpacitySlider = document.getElementById('backgroundOpacity');
        const backgroundOpacityDisplay = backgroundOpacitySlider?.nextElementSibling;
        const backgroundBlendSelect = document.getElementById('backgroundBlend');
        
        if (effectTypeSelect) {
            effectTypeSelect.value = 'none';
        }
        
        if (pixelateOptions) {
            pixelateOptions.style.display = 'none';
        }
        
        if (ditherOptions) {
            ditherOptions.style.display = 'none';
        }
        
        if (rainbowOptions) {
            rainbowOptions.style.display = 'none';
        }
        
        if (pixelSizeSlider) {
            pixelSizeSlider.value = 8;
            if (pixelValueDisplay) {
                pixelValueDisplay.textContent = '8';
            }
        }
        
        if (ditherSizeSlider) {
            ditherSizeSlider.value = 4;
            if (ditherValueDisplay) {
                ditherValueDisplay.textContent = '4';
            }
        }
        
        if (ditherAlgorithmSelect) {
            ditherAlgorithmSelect.value = 'ordered';
        }
        
        if (rainbowIntensitySlider) {
            rainbowIntensitySlider.value = 1;
            if (rainbowValueDisplay) {
                rainbowValueDisplay.textContent = '1';
            }
        }
        
        if (backgroundOpacitySlider) {
            backgroundOpacitySlider.value = 50;
            if (backgroundOpacityDisplay) {
                backgroundOpacityDisplay.textContent = '50%';
            }
        }
        
        if (backgroundScaleSlider) {
            backgroundScaleSlider.value = 100;
            if (backgroundScaleDisplay) {
                backgroundScaleDisplay.textContent = '100%';
            }
        }
        
        if (backgroundBlendSelect) {
            backgroundBlendSelect.value = 'multiply';
        }
        
        // Reset background image UI state
        if (backgroundImageTile) {
            backgroundImageTile.style.display = 'none';
        }
        if (backgroundImageControls) {
            backgroundImageControls.style.display = 'none';
        }
        if (uploadBackgroundBtn) {
            uploadBackgroundBtn.style.display = 'flex';
        }
        if (backgroundImageInput) {
            backgroundImageInput.value = '';
        }
        
        // Remove background image on reset
        if (this.meshCanvas) {
            this.meshCanvas.removeBackgroundImage();
        }

        this.warps = new Warps();
        this.meshCanvas = new Canvas(this.warps.warps[0], this.canvas, this.colors);
        this.addDefaultPoints();
        this.redraw();
    }

    redraw() {
        requestAnimationFrame(() => {
            if (this.meshCanvas) {
                this.meshCanvas.draw();
                
                // Apply noise overlay if enabled
                if (this.noiseRenderer && this.noiseRenderer.isEnabled()) {
                    this.noiseRenderer.applyNoise();
                }
            }
        });
    }

    initializeAnimationVelocities() {
        // Initialize velocities for warp points
        this.pointVelocities = [];
        if (this.warps) {
            for (let i = 0; i < this.warps.npoints; i++) {
                this.pointVelocities.push({
                    x: (Math.random() - 0.5) * this.animationSpeed,
                    y: (Math.random() - 0.5) * this.animationSpeed
                });
            }
        }

        // Initialize velocities for color points
        this.colorPointVelocities = [];
        if (this.meshCanvas && this.meshCanvas.colorPoints) {
            for (let i = 0; i < this.meshCanvas.colorPoints.length; i++) {
                this.colorPointVelocities.push({
                    x: (Math.random() - 0.5) * this.animationSpeed,
                    y: (Math.random() - 0.5) * this.animationSpeed
                });
            }
        }
    }

    toggleAnimation() {
        if (this.isAnimating) {
            this.stopAnimation();
        } else {
            this.startAnimation();
        }
    }

    startAnimation() {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        this.initializeAnimationVelocities();
        this.animate();
    }

    stopAnimation() {
        this.isAnimating = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    animate() {
        if (!this.isAnimating) return;

        this.updatePointPositions();
        
        if (this.meshCanvas) {
            this.meshCanvas.draw();
            
            // Apply noise overlay if enabled
            if (this.noiseRenderer && this.noiseRenderer.isEnabled()) {
                this.noiseRenderer.applyNoise();
            }
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    updatePointPositions() {
        if (!this.warps || !this.meshCanvas) return;

        const aspectRatio = this.meshCanvas.aspectRatio || 1;
        
        // Update warp points
        for (let i = 0; i < this.warps.npoints; i++) {
            const point = this.warps.src[i];
            const velocity = this.pointVelocities[i];
            
            if (point && velocity) {
                // Update position
                point[0] += velocity.x;
                point[1] += velocity.y;
                
                // Bounce off boundaries (clip space is -1 to 1)
                if (point[0] <= -1 || point[0] >= 1) {
                    velocity.x = -velocity.x;
                    point[0] = Math.max(-1, Math.min(1, point[0])); // Clamp to bounds
                }
                if (point[1] <= -1 || point[1] >= 1) {
                    velocity.y = -velocity.y;
                    point[1] = Math.max(-1, Math.min(1, point[1])); // Clamp to bounds
                }
            }
        }

        // Update color points
        for (let i = 0; i < this.meshCanvas.colorPoints.length; i++) {
            const colorPoint = this.meshCanvas.colorPoints[i];
            const velocity = this.colorPointVelocities[i];
            
            if (colorPoint && velocity) {
                // Update position
                colorPoint.pos[0] += velocity.x;
                colorPoint.pos[1] += velocity.y;
                
                // Calculate bounds for color points (considering aspect ratio)
                const maxX = aspectRatio;
                const minX = -aspectRatio;
                const maxY = 1;
                const minY = -1;
                
                // Bounce off boundaries
                if (colorPoint.pos[0] <= minX || colorPoint.pos[0] >= maxX) {
                    velocity.x = -velocity.x;
                    colorPoint.pos[0] = Math.max(minX, Math.min(maxX, colorPoint.pos[0])); // Clamp to bounds
                }
                if (colorPoint.pos[1] <= minY || colorPoint.pos[1] >= maxY) {
                    velocity.y = -velocity.y;
                    colorPoint.pos[1] = Math.max(minY, Math.min(maxY, colorPoint.pos[1])); // Clamp to bounds
                }
            }
        }

        // Update warp calculations
        if (this.warps) {
            this.warps.update();
        }
    }
}

// Create a single instance of the app
const app = new MeshGradientApp(); 