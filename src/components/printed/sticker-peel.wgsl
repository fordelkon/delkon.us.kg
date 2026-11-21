@group(0) @binding(0) var artwork: texture_2d<f32>;
@group(0) @binding(1) var imageSampler: sampler;
@group(0) @binding(2) var<uniform> sheet: vec4f;
@group(0) @binding(3) var<uniform> viewport: vec4f;
@group(0) @binding(4) var<uniform> fold: vec4f;

const pi = 3.14159265;

fn printAt(point: vec2f) -> vec4f {
	let uv = point / sheet.xy;
	if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) {
		return vec4f(0.0);
	}
	return textureSampleLevel(artwork, imageSampler, uv, 0.0);
}

fn over(front: vec4f, back: vec4f) -> vec4f {
	return front + back * (1.0 - front.a);
}

fn backing(ink: vec4f, light: f32) -> vec4f {
	let paper = vec3f(0.96, 0.92, 0.83) * light;
	return vec4f(mix(paper * ink.a, ink.rgb, 0.24), ink.a);
}

// The sheet leaves the table on a half circle, then extends along the
// tangent. Invert both projections so the front edge, backing and attached
// art share one continuous length of material and one render pass.
fn curlAt(point: vec2f, q: f32) -> vec4f {
	let direction = fold.xy;
	let radius = fold.w;
	if (q <= 0.0) {
		let tail = printAt(point - direction * (pi * radius - 2.0 * q));
		let ink = printAt(point);
		let contact = 1.0 - 0.19 * exp(q / max(1.0, radius * 0.55));
		return over(backing(tail, 0.98), vec4f(ink.rgb * contact, ink.a));
	}
	if (q > radius) {
		return vec4f(0.0);
	}

	let sine = clamp(q / radius, 0.0, 1.0);
	let angle = asin(sine);
	let cosine = sqrt((1.0 - sine) * (1.0 + sine));
	let front = printAt(point + direction * (q - angle * radius));
	let back = printAt(point + direction * (q - (pi - angle) * radius));
	let frontLight = 0.78 + 0.22 * cosine;
	let backLight = 0.64 + 0.34 * cosine;
	return over(backing(back, backLight), vec4f(front.rgb * frontLight, front.a));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let point = viewport.xy + uv * viewport.zw;
	let q = fold.z - dot(point, fold.xy);
	let ink = curlAt(point, q);
	if (ink.a >= 0.999) {
		return ink;
	}

	let shadowOffset = vec2f(1.5, 3.0);
	let shadowDistance = q + dot(shadowOffset, fold.xy);
	// The contact shadow is zero past the ramp; skip sampling the texture there.
	if (shadowDistance >= 3.0) {
		return ink;
	}

	let contact = 1.0 - smoothstep(0.0, 3.0, shadowDistance);
	let shadow = 0.23 * contact * printAt(point - shadowOffset).a;
	return over(ink, vec4f(0.0, 0.0, 0.0, shadow));
}
