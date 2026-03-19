function rgbToHex(packed) {
  return "#" + packed.toString(16).padStart(6, "0");
}
function hexToRgb(hex) {
  return parseInt(hex.slice(1), 16);
}

export { rgbToHex, hexToRgb };
