#version 300 es

layout (location = 0) in vec3 aPos;

uniform vec2 uOffset;  
uniform float verticalFlip;

void main() {
    vec2 pos = aPos.xy + uOffset; 
    pos.y *= verticalFlip; 
    
    gl_Position = vec4(pos, aPos.z, 1.0);
} 