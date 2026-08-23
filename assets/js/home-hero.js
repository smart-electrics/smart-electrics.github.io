(() => {
  const scene = document.querySelector("[data-home-scene]");
  const canvas = document.querySelector("[data-home-canvas]");
  const status = document.querySelector("[data-scene-status]");
  const controls = [...document.querySelectorAll("[data-scene-control]")];

  if (!scene || !status || !controls.length) return;

  const setScene = (control) => {
    scene.dataset.state = control.dataset.scene;
    status.textContent = control.dataset.sceneDescription;
    controls.forEach((candidate) => {
      candidate.setAttribute("aria-pressed", String(candidate === control));
    });
  };

  controls.forEach((control) => control.addEventListener("click", () => setScene(control)));

  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let gl;
  try {
    gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
      premultipliedAlpha: false
    });
  } catch (_) {
    return;
  }
  if (!gl) return;

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
  };

  const vertexShader = compileShader(gl.VERTEX_SHADER, `
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform vec2 resolution;
    uniform float time;
    uniform float mode;

    void main() {
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      float aspect = resolution.x / resolution.y;
      vec2 point = vec2(uv.x * aspect, uv.y);
      vec2 centre = vec2((0.58 + mode * 0.055 + sin(time * 0.00022) * 0.025) * aspect, 0.62 + cos(time * 0.00017) * 0.025);
      float distanceFromCentre = distance(point, centre);
      float halo = smoothstep(0.72, 0.02, distanceFromCentre);
      float filament = smoothstep(0.055, 0.0, abs(distanceFromCentre - 0.24 - sin(time * 0.0003) * 0.018));
      vec3 copper = vec3(0.686, 0.365, 0.220);
      vec3 amber = vec3(0.965, 0.643, 0.373);
      vec3 colour = mix(copper, amber, halo);
      float alpha = halo * 0.42 + filament * 0.12;
      gl_FragColor = vec4(colour, alpha);
    }
  `);

  if (!vertexShader || !fragmentShader) return;

  const program = gl.createProgram();
  if (!program) return;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

  const position = gl.getAttribLocation(program, "position");
  const resolution = gl.getUniformLocation(program, "resolution");
  const time = gl.getUniformLocation(program, "time");
  const mode = gl.getUniformLocation(program, "mode");
  const geometry = gl.createBuffer();
  if (!geometry || position < 0 || !resolution || !time || !mode) return;

  gl.bindBuffer(gl.ARRAY_BUFFER, geometry);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );
  gl.useProgram(program);
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const modeOrder = ["lighting", "climate", "security", "power"];
  let frame = 0;
  let visible = true;
  let lost = false;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const render = (timestamp) => {
    if (lost || !visible || document.hidden) {
      frame = 0;
      return;
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform1f(time, timestamp);
    gl.uniform1f(mode, Math.max(0, modeOrder.indexOf(scene.dataset.state)));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    frame = requestAnimationFrame(render);
  };

  const start = () => {
    if (!frame && !lost && visible && !document.hidden) frame = requestAnimationFrame(render);
  };

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    start();
  }, { threshold: 0.05 });

  resize();
  scene.dataset.webgl = "ready";
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", start);
  canvas.addEventListener("webglcontextlost", () => {
    lost = true;
    scene.dataset.webgl = "fallback";
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  });
  observer.observe(scene);
  start();
})();
