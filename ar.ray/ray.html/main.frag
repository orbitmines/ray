#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;

// 2D rotation function
mat2 rot2D(float a) {
    return mat2(cos(a), -sin(a), sin(a), cos(a));
}

// Custom gradient - https://iquilezles.org/articles/palettes/
vec3 palette(float t) {
    return .5+.5*cos(6.28318*(t+vec3(.3,.416,.557)));
}

// Octahedron SDF - https://iquilezles.org/articles/distfunctions/
float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x+p.y+p.z-s)*0.57735027;
}

// Scene distance
float map(vec3 p) {
    p.z += u_time * .4; // Forward movement
    
    // Space repetition
    p.xy = fract(p.xy) - .5;     // spacing: 1
    p.z =  mod(p.z, .25) - .125; // spacing: .25
    
    return sdOctahedron(p, .15); // Octahedron
}

void main(){
    vec2 uv = (gl_FragCoord.xy * 2. - u_resolution.xy) / u_resolution.y;
    vec2  m = (u_mouse.xy * 2. - u_resolution.xy) / u_resolution.y;
    
    // Default circular motion if mouse not clicked
    // if (u_mouse.z <= 0.) m = vec2(cos(u_time*.2), sin(u_time*.2));

    // Initialization
    vec3 ro = vec3(0, 0, -3);         // ray origin
    vec3 rd = normalize(vec3(uv, 1)); // ray direction
    vec3 color = vec3(0);               // final pixel color

    float t = 0.; // total distance travelled

    int i; // Raymarching
    for (i = 0; i < 80; i++) {
        vec3 p = ro + rd * t; // position along the ray
        
        p.xy *= rot2D(t*.15 * m.x);     // rotate ray around z-axis

        p.y += sin(t*(m.y+1.)*.5)*.35;  // wiggle ray

        float d = map(p);     // current distance to the scene

        t += d;               // "march" the ray

        if (d < .001 || t > 100.) break; // early stop
    }

    // Coloring
    color = palette(t*.04 + float(i)*.005);

    gl_FragColor = vec4(color, 1);
}