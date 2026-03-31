import QRCode from "qrcode";

const SWISS_QR_IMAGE_SIZE = 420;

function getSvgViewport(svg: string) {
  const viewBoxMatch = svg.match(/viewBox\s*=\s*"([^"]+)"/i);
  if (!viewBoxMatch) {
    return {
      minX: 0,
      minY: 0,
      width: SWISS_QR_IMAGE_SIZE,
      height: SWISS_QR_IMAGE_SIZE,
    };
  }

  const parts = viewBoxMatch[1]
    .trim()
    .split(/\s+/)
    .map((part) => Number(part));

  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    return {
      minX: 0,
      minY: 0,
      width: SWISS_QR_IMAGE_SIZE,
      height: SWISS_QR_IMAGE_SIZE,
    };
  }

  return {
    minX: parts[0],
    minY: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

function buildSwissCrossOverlaySvg(svg: string) {
  const viewport = getSvgViewport(svg);
  const imageSize = Math.min(viewport.width, viewport.height);

  // Per Swiss QR bill visual rules, keep a centered mark with white frame, black square and white cross.
  const outerSize = imageSize * 0.174;
  const borderThickness = outerSize * 0.085;
  const blackSize = outerSize - borderThickness * 2;
  const crossLength = blackSize * 0.56;
  const crossThickness = blackSize * 0.22;
  const cx = viewport.minX + viewport.width / 2;
  const cy = viewport.minY + viewport.height / 2;

  return [
    `<rect x="${(cx - outerSize / 2).toFixed(3)}" y="${(cy - outerSize / 2).toFixed(3)}" width="${outerSize.toFixed(3)}" height="${outerSize.toFixed(3)}" fill="#FFFFFF"/>`,
    `<rect x="${(cx - blackSize / 2).toFixed(3)}" y="${(cy - blackSize / 2).toFixed(3)}" width="${blackSize.toFixed(3)}" height="${blackSize.toFixed(3)}" fill="#000000"/>`,
    `<rect x="${(cx - crossLength / 2).toFixed(3)}" y="${(cy - crossThickness / 2).toFixed(3)}" width="${crossLength.toFixed(3)}" height="${crossThickness.toFixed(3)}" fill="#FFFFFF"/>`,
    `<rect x="${(cx - crossThickness / 2).toFixed(3)}" y="${(cy - crossLength / 2).toFixed(3)}" width="${crossThickness.toFixed(3)}" height="${crossLength.toFixed(3)}" fill="#FFFFFF"/>`,
  ].join("");
}

export async function buildSwissQrSvg(payload: string) {
  const content = payload.trim();
  if (!content) {
    throw new Error("Missing payload.");
  }

  const qrSvg = await QRCode.toString(content, {
    type: "svg",
    margin: 1,
    width: SWISS_QR_IMAGE_SIZE,
    errorCorrectionLevel: "M",
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });

  const overlay = buildSwissCrossOverlaySvg(qrSvg);
  return qrSvg.replace("</svg>", `${overlay}</svg>`);
}

export async function buildSwissQrSvgDataUrl(payload: string) {
  const svg = await buildSwissQrSvg(payload);
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
