class ColorPalette {
    static generate() {
        const methods = [
            this.generateVibrantPalette,
            this.generateEarthyPalette,
            this.generateCoolPalette,
            this.generateWarmPalette
        ];
        
        const randomMethod = methods[Math.floor(Math.random() * methods.length)];
        return randomMethod.call(this);
    }

    static generateVibrantPalette() {
        // Generate base hue
        const baseHue = Math.random() * 360;
        
        // Light color: High lightness, low saturation
        const light = chroma.hsl(
            (baseHue + Math.random() * 30) % 360,
            0.3 + Math.random() * 0.2,  // 0.3-0.5 saturation
            0.85 + Math.random() * 0.1   // 0.85-0.95 lightness
        );

        // Dark color: Low lightness, medium saturation
        const dark = chroma.hsl(
            (baseHue + 180 + Math.random() * 30) % 360,
            0.5 + Math.random() * 0.3,  // 0.5-0.8 saturation
            0.15 + Math.random() * 0.1   // 0.15-0.25 lightness
        );

        // Accent color: High saturation, medium-high lightness
        const accent = chroma.hsl(
            (baseHue + 90 + Math.random() * 60) % 360,
            0.8 + Math.random() * 0.2,  // 0.8-1.0 saturation
            0.6 + Math.random() * 0.1    // 0.6-0.7 lightness
        );

        // Primary color: Medium saturation, medium lightness
        const primary = chroma.hsl(
            (baseHue + 270 + Math.random() * 30) % 360,
            0.6 + Math.random() * 0.2,  // 0.6-0.8 saturation
            0.4 + Math.random() * 0.2    // 0.4-0.6 lightness
        );

        return {
            tl: light.hex(),
            tr: accent.hex(),
            bl: primary.hex(),
            br: dark.hex()
        };
    }

    static generateEarthyPalette() {
        // Earthy tones have lower saturation and are warmer
        const light = chroma.hsl(40 + Math.random() * 20, 0.3, 0.9);  // Sand/Cream
        const dark = chroma.hsl(20 + Math.random() * 20, 0.6, 0.2);   // Deep Brown
        const accent = chroma.hsl(100 + Math.random() * 40, 0.6, 0.4); // Forest Green
        const primary = chroma.hsl(30 + Math.random() * 20, 0.7, 0.5); // Terra Cotta

        return {
            tl: light.hex(),
            tr: accent.hex(),
            bl: primary.hex(),
            br: dark.hex()
        };
    }

    static generateCoolPalette() {
        // Cool tones focus on blues and purples
        const light = chroma.hsl(200 + Math.random() * 20, 0.3, 0.9);  // Light Blue
        const dark = chroma.hsl(240 + Math.random() * 30, 0.7, 0.2);   // Deep Purple
        const accent = chroma.hsl(170 + Math.random() * 20, 0.8, 0.6); // Turquoise
        const primary = chroma.hsl(220 + Math.random() * 20, 0.6, 0.5); // Medium Blue

        return {
            tl: light.hex(),
            tr: accent.hex(),
            bl: primary.hex(),
            br: dark.hex()
        };
    }

    static generateWarmPalette() {
        // Warm tones focus on reds and oranges
        const light = chroma.hsl(40 + Math.random() * 20, 0.3, 0.9);   // Light Peach
        const dark = chroma.hsl(350 + Math.random() * 20, 0.7, 0.2);   // Deep Red
        const accent = chroma.hsl(20 + Math.random() * 20, 0.8, 0.6);  // Bright Orange
        const primary = chroma.hsl(0 + Math.random() * 20, 0.6, 0.5);  // Medium Red

        return {
            tl: light.hex(),
            tr: accent.hex(),
            bl: primary.hex(),
            br: dark.hex()
        };
    }

    static adjustPalette(palette) {
        // Ensure proper contrast and balance
        const colors = Object.values(palette);
        
        // Convert to LAB for better color manipulation
        const labColors = colors.map(c => chroma(c).lab());
        
        // Adjust lightness if needed
        const lightness = labColors.map(c => c[0]);
        const lightnessRange = Math.max(...lightness) - Math.min(...lightness);
        
        if (lightnessRange < 50) {  // Ensure minimum contrast
            // Adjust light color lighter and dark color darker
            palette.tl = chroma(palette.tl).luminance(0.9).hex();
            palette.br = chroma(palette.br).luminance(0.1).hex();
        }

        return palette;
    }
}

export default ColorPalette; 