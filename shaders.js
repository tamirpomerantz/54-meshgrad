export const VERTEX_SHADER = `
    attribute vec2 a_Position;
    attribute vec2 a_TexCoord;
    varying vec2 v_TexCoord;
    
    void main() {
        gl_Position = vec4(a_Position, 0.0, 1.0);
        v_TexCoord = a_TexCoord;
    }
`;

export const FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_TexCoord;
    uniform int warp;
    uniform int npoints;
    uniform vec2 points[32];
    uniform float s2[32];
    uniform vec2 w[32];
    uniform vec4 u_color1;
    uniform vec4 u_color2;
    uniform vec4 u_color3;
    uniform vec4 u_color4;
    uniform vec2 colorPos1;
    uniform vec2 colorPos2;
    uniform vec2 colorPos3;
    uniform vec2 colorPos4;
    uniform float aspectRatio;
    uniform int colorSpace; // 0: RGB, 1: OKLAB, 2: HSL, 3: LCH

    float rbf(vec2 x, vec2 y, float s2) {
        vec2 d = vec2(
            (x.x - y.x) * max(1.0, aspectRatio),
            (x.y - y.y) * max(1.0, 1.0/aspectRatio)
        );
        return sqrt(dot(d, d) + s2);
    }

    vec2 warpPoint(vec2 p) {
        vec2 q = p;
        if (npoints >= 4) {
            for (int i = 0; i < 32; i++) {
                if (i >= npoints) break;
                float r = rbf(p, points[i], s2[i]);
                q += w[i] * r;
            }
        }
        return q;
    }

    // RGB to OKLAB conversion
    vec3 rgb2oklab(vec3 c) {
        float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
        float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
        float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;

        float l_ = pow(l, 1.0/3.0);
        float m_ = pow(m, 1.0/3.0);
        float s_ = pow(s, 1.0/3.0);

        return vec3(
            0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
        );
    }

    // OKLAB to RGB conversion
    vec3 oklab2rgb(vec3 c) {
        float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
        float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
        float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;

        float l = l_ * l_ * l_;
        float m = m_ * m_ * m_;
        float s = s_ * s_ * s_;

        return vec3(
            +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
        );
    }

    // RGB to HSL conversion
    vec3 rgb2hsl(vec3 color) {
        float maxColor = max(max(color.r, color.g), color.b);
        float minColor = min(min(color.r, color.g), color.b);
        float delta = maxColor - minColor;
        
        vec3 hsl = vec3(0.0, 0.0, (maxColor + minColor) / 2.0);
        
        if (delta > 0.0) {
            hsl.y = hsl.z < 0.5 ? delta / (maxColor + minColor) : delta / (2.0 - maxColor - minColor);
            
            float deltaR = (((maxColor - color.r) / 6.0) + (delta / 2.0)) / delta;
            float deltaG = (((maxColor - color.g) / 6.0) + (delta / 2.0)) / delta;
            float deltaB = (((maxColor - color.b) / 6.0) + (delta / 2.0)) / delta;
            
            if (color.r == maxColor) {
                hsl.x = deltaB - deltaG;
            } else if (color.g == maxColor) {
                hsl.x = (1.0 / 3.0) + deltaR - deltaB;
            } else {
                hsl.x = (2.0 / 3.0) + deltaG - deltaR;
            }
            
            if (hsl.x < 0.0) hsl.x += 1.0;
            if (hsl.x > 1.0) hsl.x -= 1.0;
        }
        
        return hsl;
    }

    float hue2rgb(float p, float q, float t) {
        if (t < 0.0) t += 1.0;
        if (t > 1.0) t -= 1.0;
        if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
        if (t < 1.0/2.0) return q;
        if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
        return p;
    }

    // HSL to RGB conversion
    vec3 hsl2rgb(vec3 hsl) {
        vec3 rgb = vec3(0.0);
        
        if (hsl.y == 0.0) {
            rgb = vec3(hsl.z);
        } else {
            float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
            float p = 2.0 * hsl.z - q;
            
            rgb.r = hue2rgb(p, q, hsl.x + 1.0/3.0);
            rgb.g = hue2rgb(p, q, hsl.x);
            rgb.b = hue2rgb(p, q, hsl.x - 1.0/3.0);
        }
        
        return rgb;
    }

    // RGB to LCH conversion (via OKLAB)
    vec3 rgb2lch(vec3 rgb) {
        vec3 lab = rgb2oklab(rgb);
        float l = lab.x;
        float c = sqrt(lab.y * lab.y + lab.z * lab.z);
        float h = atan(lab.z, lab.y);
        if (h < 0.0) h += 2.0 * 3.14159265359;
        return vec3(l, c, h);
    }

    // LCH to RGB conversion (via OKLAB)
    vec3 lch2rgb(vec3 lch) {
        float l = lch.x;
        float c = lch.y;
        float h = lch.z;
        vec3 lab = vec3(
            l,
            c * cos(h),
            c * sin(h)
        );
        return oklab2rgb(lab);
    }

    vec3 interpolateInColorSpace(vec3 color1, vec3 color2, float t) {
        if (colorSpace == 1) { // OKLAB
            vec3 oklab1 = rgb2oklab(color1);
            vec3 oklab2 = rgb2oklab(color2);
            return oklab2rgb(mix(oklab1, oklab2, t));
        } else if (colorSpace == 2) { // HSL
            vec3 hsl1 = rgb2hsl(color1);
            vec3 hsl2 = rgb2hsl(color2);
            
            // Handle hue interpolation
            float h1 = hsl1.x;
            float h2 = hsl2.x;
            if (abs(h2 - h1) > 0.5) h2 += h2 < h1 ? 1.0 : -1.0;
            hsl1.x = mix(h1, h2, t);
            if (hsl1.x >= 1.0) hsl1.x -= 1.0;
            
            // Interpolate S and L
            hsl1.yz = mix(hsl1.yz, hsl2.yz, t);
            return hsl2rgb(hsl1);
        } else if (colorSpace == 3) { // LCH
            vec3 lch1 = rgb2lch(color1);
            vec3 lch2 = rgb2lch(color2);
            
            // Handle hue interpolation
            float h1 = lch1.z;
            float h2 = lch2.z;
            if (abs(h2 - h1) > 3.14159265359) h2 += h2 < h1 ? 6.28318530718 : -6.28318530718;
            lch1.z = mix(h1, h2, t);
            if (lch1.z >= 6.28318530718) lch1.z -= 6.28318530718;
            
            // Interpolate L and C
            lch1.xy = mix(lch1.xy, lch2.xy, t);
            return lch2rgb(lch1);
        }
        
        // Default: RGB
        return mix(color1, color2, t);
    }

    vec4 interpolateColors(vec2 p) {
        // Calculate weights based on distances
        float d1 = distance(p, colorPos1);
        float d2 = distance(p, colorPos2);
        float d3 = distance(p, colorPos3);
        float d4 = distance(p, colorPos4);

        d1 = d1 * d1;
        d2 = d2 * d2;
        d3 = d3 * d3;
        d4 = d4 * d4;

        float w1 = 1.0 / (d1 + 0.0001);
        float w2 = 1.0 / (d2 + 0.0001);
        float w3 = 1.0 / (d3 + 0.0001);
        float w4 = 1.0 / (d4 + 0.0001);

        float wSum = w1 + w2 + w3 + w4;
        w1 /= wSum;
        w2 /= wSum;
        w3 /= wSum;
        w4 /= wSum;

        // Interpolate in selected color space
        vec3 result = vec3(0.0);
        vec3 c1 = u_color1.rgb;
        vec3 c2 = u_color2.rgb;
        vec3 c3 = u_color3.rgb;
        vec3 c4 = u_color4.rgb;

        // First interpolate pairs
        vec3 top = interpolateInColorSpace(c1, c2, w2 / (w1 + w2));
        vec3 bottom = interpolateInColorSpace(c3, c4, w4 / (w3 + w4));
        
        // Then interpolate between pairs
        result = interpolateInColorSpace(top, bottom, (w3 + w4));

        return vec4(result, 1.0);
    }

    void main() {
        vec2 p = vec2(v_TexCoord.x * 2.0 - 1.0, v_TexCoord.y * 2.0 - 1.0);
        vec2 q = warpPoint(p);
        gl_FragColor = interpolateColors(q);
    }
`;

export const POINT_VERTEX_SHADER = `
    attribute vec2 a_Position;
    uniform float radius;
    
    void main() {
        gl_Position = vec4(a_Position, 0.0, 1.0);
        gl_PointSize = radius * 2.0;
    }
`;

export const POINT_FRAGMENT_SHADER = `
    precision mediump float;
    uniform vec3 color;
    
    void main() {
        vec2 coord = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(coord, coord);
        if (r2 > 1.0) discard;
        gl_FragColor = vec4(color, 1.0);
    }
`;

// Post-processing shaders for levels adjustment
export const POST_VERTEX_SHADER = `
    attribute vec2 a_Position;
    attribute vec2 a_TexCoord;
    varying vec2 v_TexCoord;
    
    void main() {
        gl_Position = vec4(a_Position, 0.0, 1.0);
        v_TexCoord = a_TexCoord;
    }
`;

export const LEVELS_FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_TexCoord;
    uniform sampler2D u_Texture;
    uniform float u_LevelsLow;
    uniform float u_LevelsMid;
    uniform float u_LevelsHigh;
    
    void main() {
        vec4 color = texture2D(u_Texture, v_TexCoord);
        
        // Apply levels adjustment
        // First, remap input range from [low, high] to [0, 1]
        vec3 remapped = (color.rgb - u_LevelsLow) / (u_LevelsHigh - u_LevelsLow);
        remapped = clamp(remapped, 0.0, 1.0);
        
        // Apply gamma correction (midtones adjustment)
        // Gamma = 1.0 / u_LevelsMid
        float gamma = 1.0 / u_LevelsMid;
        vec3 adjusted = pow(remapped, vec3(gamma));
        
        gl_FragColor = vec4(adjusted, color.a);
    }
`;

export const PIXELATE_FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_TexCoord;
    uniform sampler2D u_Texture;
    uniform float u_PixelSize;
    uniform vec2 u_Resolution;
    
    void main() {
        // Calculate pixel size in UV coordinates
        vec2 pixelSize = u_PixelSize / u_Resolution;
        
        // Snap to pixel grid
        vec2 pixelatedUV = floor(v_TexCoord / pixelSize) * pixelSize;
        
        // Sample the texture at the pixelated coordinates
        gl_FragColor = texture2D(u_Texture, pixelatedUV);
    }
`;

export const DITHER_FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_TexCoord;
    uniform sampler2D u_Texture;
    uniform float u_DitherSize;
    uniform vec2 u_Resolution;
    uniform int u_Algorithm; // 0: Ordered, 1: Floyd-Steinberg, 2: Atkinson
    uniform vec4 u_Color1;
    uniform vec4 u_Color2;
    uniform vec4 u_Color3;
    uniform vec4 u_Color4;
    
    // Bayer matrix for ordered dithering (4x4)
    const mat4 bayerMatrix = mat4(
        0.0/16.0, 8.0/16.0, 2.0/16.0, 10.0/16.0,
        12.0/16.0, 4.0/16.0, 14.0/16.0, 6.0/16.0,
        3.0/16.0, 11.0/16.0, 1.0/16.0, 9.0/16.0,
        15.0/16.0, 7.0/16.0, 13.0/16.0, 5.0/16.0
    );
    
    float getBayerValue(vec2 pos) {
        int x = int(mod(pos.x, 4.0));
        int y = int(mod(pos.y, 4.0));
        
        if (y == 0) {
            if (x == 0) return bayerMatrix[0][0];
            if (x == 1) return bayerMatrix[0][1];
            if (x == 2) return bayerMatrix[0][2];
            return bayerMatrix[0][3];
        } else if (y == 1) {
            if (x == 0) return bayerMatrix[1][0];
            if (x == 1) return bayerMatrix[1][1];
            if (x == 2) return bayerMatrix[1][2];
            return bayerMatrix[1][3];
        } else if (y == 2) {
            if (x == 0) return bayerMatrix[2][0];
            if (x == 1) return bayerMatrix[2][1];
            if (x == 2) return bayerMatrix[2][2];
            return bayerMatrix[2][3];
        } else {
            if (x == 0) return bayerMatrix[3][0];
            if (x == 1) return bayerMatrix[3][1];
            if (x == 2) return bayerMatrix[3][2];
            return bayerMatrix[3][3];
        }
    }
    
    vec3 findClosestColor(vec3 color) {
        float minDist = 999.0;
        vec3 closest = u_Color1.rgb;
        
        vec3 diff1 = color - u_Color1.rgb;
        float dist1 = dot(diff1, diff1);
        if (dist1 < minDist) {
            minDist = dist1;
            closest = u_Color1.rgb;
        }
        
        vec3 diff2 = color - u_Color2.rgb;
        float dist2 = dot(diff2, diff2);
        if (dist2 < minDist) {
            minDist = dist2;
            closest = u_Color2.rgb;
        }
        
        vec3 diff3 = color - u_Color3.rgb;
        float dist3 = dot(diff3, diff3);
        if (dist3 < minDist) {
            minDist = dist3;
            closest = u_Color3.rgb;
        }
        
        vec3 diff4 = color - u_Color4.rgb;
        float dist4 = dot(diff4, diff4);
        if (dist4 < minDist) {
            minDist = dist4;
            closest = u_Color4.rgb;
        }
        
        return closest;
    }
    
    void main() {
        vec2 pixelPos = floor(v_TexCoord * u_Resolution / u_DitherSize) * u_DitherSize;
        vec2 pixelUV = pixelPos / u_Resolution;
        
        vec4 originalColor = texture2D(u_Texture, pixelUV);
        vec3 color = originalColor.rgb;
        
        if (u_Algorithm == 0) {
            // Ordered (Bayer) dithering
            vec2 bayerPos = floor(v_TexCoord * u_Resolution / u_DitherSize);
            float threshold = getBayerValue(bayerPos);
            
            // Apply threshold to each color channel
            color += (threshold - 0.5) * 0.2;
            color = clamp(color, 0.0, 1.0);
            
            gl_FragColor = vec4(findClosestColor(color), originalColor.a);
        }
        else if (u_Algorithm == 1 || u_Algorithm == 2) {
            // Floyd-Steinberg or Atkinson (simplified for real-time)
            // For real-time, we'll use a noise-based approximation
            vec2 noisePos = floor(v_TexCoord * u_Resolution / u_DitherSize);
            float noise = fract(sin(dot(noisePos, vec2(12.9898, 78.233))) * 43758.5453);
            
            // Apply error diffusion approximation
            float errorAmount = u_Algorithm == 1 ? 0.15 : 0.125; // Floyd vs Atkinson
            color += (noise - 0.5) * errorAmount;
            color = clamp(color, 0.0, 1.0);
            
            gl_FragColor = vec4(findClosestColor(color), originalColor.a);
        }
        else {
            // Fallback to closest color
            gl_FragColor = vec4(findClosestColor(color), originalColor.a);
        }
    }
`; 