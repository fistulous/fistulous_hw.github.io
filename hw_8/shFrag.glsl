#version 300 es
precision highp float;

out vec4 FragColor;
in vec3 fragPos;  
in vec3 normal;  
in vec2 texCoord;

struct Material {
    sampler2D diffuse;
    vec3 specular;
    float shininess;
};

struct Light {
    vec3 direction;
    vec3 ambient;
    vec3 diffuse;
    vec3 specular;
};

uniform Material material;
uniform Light light;
uniform vec3 u_viewPos;

// 3단계 양자화 함수 (밝기값용)
float quantizeValue(float v) {
    if (v < 0.3333) {
        return 0.1666;  // 첫 번째 구간 중간값
    } else if (v < 0.6666) {
        return 0.5;     // 두 번째 구간 중간값
    } else {
        return 0.8333;  // 세 번째 구간 중간값
    }
}

void main() {
    vec3 rgb = texture(material.diffuse, texCoord).rgb;

    // ambient (부드럽게 그대로)
    vec3 ambient = light.ambient * rgb;

    // diffuse (양자화된 밝기 사용)
    vec3 norm = normalize(normal);
    vec3 lightDir = normalize(light.direction);
    float diff = max(dot(norm, lightDir), 0.0);
    diff = quantizeValue(diff); // 🎨 밝기 단계 양자화
    vec3 diffuse = light.diffuse * diff * rgb;

    // specular (양자화된 밝기 사용)
    vec3 viewDir = normalize(u_viewPos - fragPos);
    vec3 reflectDir = reflect(-lightDir, norm);
    float spec = 0.0;
    if (diff > 0.0) {
        spec = pow(max(dot(viewDir, reflectDir), 0.0), material.shininess);
        spec = quantizeValue(spec); // 🎨 반사광 단계 양자화
    }
    vec3 specular = light.specular * spec * material.specular;

    // combine
    vec3 result = ambient + diffuse + specular;
    FragColor = vec4(result, 1.0);
}
