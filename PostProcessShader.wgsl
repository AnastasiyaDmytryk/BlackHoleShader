@group(0) @binding(0) var uSampler: sampler;
@group(0) @binding(1) var uScreenTex: texture_2d<f32>;

struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
};

@vertex
fn vs_main(@location(0) pos: vec4f) -> VSOut {
    var out: VSOut;
    out.pos = pos;
    out.uv = pos.xy * 0.5 + 0.5;  // convert from NDC → UV
    return out;
}

fn distort_blackhole(uv: vec2f) -> vec2f {
    let center = vec2f(0.5, 0.5);
    let offset = uv - center;

    let r = length(offset);

    let strength = 0.15;
    let distort = 1.0 / (1.0 + r * 6.0 * strength);

    return center + offset * distort;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
    let uv = distort_blackhole(in.uv);
    return textureSample(uScreenTex, uSampler, uv);
}
