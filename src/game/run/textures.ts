import * as THREE from "three";

/** All textures are drawn on canvases at start-up: nothing to download, nothing borrowed. */
function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Seeded so the textures look the same every load. */
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

export const ROAD_WIDTH = 9;
export const ROAD_TILE = 12;

export function roadTexture(length: number) {
  return canvas(256, 512, (g) => {
    const r = prng(7);
    g.fillStyle = "#2b2c2a";
    g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 2600; i++) {
      const v = 30 + r() * 40;
      g.fillStyle = `rgba(${v},${v},${v - 4},${0.35 + r() * 0.4})`;
      g.fillRect(r() * 256, r() * 512, 1 + r() * 2, 1 + r() * 2);
    }
    // Patches and cracks.
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(20,20,18,${0.25 + r() * 0.3})`;
      g.fillRect(r() * 220, r() * 480, 20 + r() * 60, 20 + r() * 50);
    }
    g.strokeStyle = "rgba(10,10,10,.7)";
    g.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      let x = r() * 256;
      let y = r() * 512;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.5) * 30;
        y += r() * 22;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    const px = (x: number) => ((x + ROAD_WIDTH / 2) / ROAD_WIDTH) * 256;
    // Lane dashes, 3 m on, 3 m off.
    g.fillStyle = "rgba(233,228,214,.75)";
    for (const x of [-1.2, 1.2]) for (const y of [0, 256]) g.fillRect(px(x) - 2, y, 4, 128);
    // Edge lines.
    g.fillStyle = "rgba(242,169,59,.85)";
    for (const x of [-4.25, 4.25]) g.fillRect(px(x) - 3, 0, 6, 512);
  }, [1, length / ROAD_TILE]);
}

export function sidewalkTexture(length: number) {
  return canvas(128, 256, (g) => {
    const r = prng(11);
    g.fillStyle = "#3b3c38";
    g.fillRect(0, 0, 128, 256);
    g.strokeStyle = "#262724";
    g.lineWidth = 3;
    for (let y = 0; y <= 256; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(128, y);
      g.stroke();
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.3})`;
      g.fillRect(r() * 128, r() * 256, 2, 2);
    }
    g.fillStyle = "#5a5a52";
    g.fillRect(0, 0, 10, 256);
  }, [1, length / 6]);
}

export function railTexture(length: number) {
  return canvas(256, 32, (g) => {
    g.clearRect(0, 0, 256, 32);
    g.fillStyle = "#6c706a";
    g.fillRect(0, 4, 256, 7);
    g.fillRect(0, 16, 256, 4);
    g.fillStyle = "#3c403b";
    for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 8, 32);
  }, [length / 12, 1]);
}

export function stripes(fg = "#f2a93b", bg = "#151515", n = 6) {
  return canvas(128, 128, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = fg;
    const w = 128 / n;
    for (let i = -n; i < n * 2; i++) {
      g.beginPath();
      g.moveTo(i * w * 2, 128);
      g.lineTo(i * w * 2 + w, 128);
      g.lineTo(i * w * 2 + w + 128, 0);
      g.lineTo(i * w * 2 + 128, 0);
      g.closePath();
      g.fill();
    }
  });
}

export function concreteTexture() {
  return canvas(128, 128, (g) => {
    const r = prng(23);
    g.fillStyle = "#8a877d";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 700; i++) {
      const v = 100 + r() * 60;
      g.fillStyle = `rgba(${v},${v},${v - 8},.5)`;
      g.fillRect(r() * 128, r() * 128, 2, 2);
    }
    g.fillStyle = "#f2a93b";
    g.fillRect(0, 54, 128, 20);
    g.fillStyle = "#151515";
    for (let x = -20; x < 140; x += 26) {
      g.beginPath();
      g.moveTo(x, 74);
      g.lineTo(x + 12, 74);
      g.lineTo(x + 32, 54);
      g.lineTo(x + 20, 54);
      g.fill();
    }
  });
}

export function containerTexture(color: string) {
  return canvas(128, 128, (g) => {
    const r = prng(color.length * 31);
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 10) {
      g.fillStyle = "rgba(0,0,0,.25)";
      g.fillRect(x, 0, 3, 128);
      g.fillStyle = "rgba(255,255,255,.07)";
      g.fillRect(x + 4, 0, 2, 128);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(90,40,20,${r() * 0.5})`;
      g.beginPath();
      g.arc(r() * 128, r() * 128, 2 + r() * 8, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Building facades: dark concrete with a scatter of lit windows. */
export function facadeTexture(seed: number, cols: number, rows: number, lit: string) {
  return canvas(256, 512, (g) => {
    const r = prng(seed);
    g.fillStyle = "#16181a";
    g.fillRect(0, 0, 256, 512);
    const cw = 256 / cols;
    const rh = 512 / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const roll = r();
        g.fillStyle = roll > 0.86 ? lit : roll > 0.8 ? "#3a2f22" : "#0b0c0d";
        g.fillRect(x * cw + cw * 0.22, y * rh + rh * 0.25, cw * 0.56, rh * 0.5);
      }
    }
    for (let i = 0; i < 6; i++) {
      g.fillStyle = "rgba(0,0,0,.55)";
      g.fillRect(r() * 256, r() * 512, 30 + r() * 60, 40 + r() * 80);
    }
  });
}

export function skylineTexture() {
  return canvas(1024, 256, (g) => {
    const r = prng(99);
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.7, "rgba(255,255,255,.35)");
    grad.addColorStop(1, "rgba(255,255,255,.6)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 256);
    g.fillStyle = "#050606";
    let x = 0;
    while (x < 1024) {
      const w = 20 + r() * 60;
      const h = 40 + r() * 150;
      g.fillRect(x, 256 - h, w, h);
      if (r() > 0.6) g.fillRect(x + w * 0.4, 256 - h - 30, 4, 30);
      if (r() > 0.75) {
        // A broken top.
        g.beginPath();
        g.moveTo(x, 256 - h);
        g.lineTo(x + w * 0.5, 256 - h - 20 * r());
        g.lineTo(x + w, 256 - h);
        g.fill();
      }
      x += w - 4;
    }
  });
}

export function glowTexture() {
  return canvas(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

export function blobShadow() {
  return canvas(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,.65)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

export function signTexture(text: string) {
  return canvas(256, 64, (g) => {
    g.fillStyle = "#c9361f";
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = "#e9e4d6";
    g.lineWidth = 4;
    g.strokeRect(5, 5, 246, 54);
    g.fillStyle = "#e9e4d6";
    g.font = "bold 34px Impact, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 128, 34);
  });
}

/** The backpack plate: the player's Squeek, or a district badge without one. */
export function defaultPlate() {
  return canvas(128, 128, (g) => {
    g.fillStyle = "#1a1f1c";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#f2a93b";
    g.font = "bold 64px Impact, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("LD", 64, 68);
    g.strokeStyle = "#f2a93b";
    g.lineWidth = 6;
    g.strokeRect(6, 6, 116, 116);
  });
}

export async function plateFromImage(url: string): Promise<THREE.Texture | null> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const t = canvas(256, 256, (g) => {
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, 256, 256);
  });
  t.magFilter = THREE.NearestFilter;
  return t;
}
