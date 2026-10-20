const code39: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn', '6': 'nnwww nnnn'.replace(' ', ''), '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn',
  F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  '-': 'nnnwnwnwn', '*': 'nwnnwnwnn',
}

export function code39Svg(barcode: string) {
  if (!/^\d{16}$/.test(barcode)) throw new Error('Invalid internal barcode.')
  const narrow = 2, wide = 5, height = 54, quiet = 10
  const chars = `*${barcode}*`
  let x = quiet
  const bars: string[] = []
  for (const character of chars) {
    const pattern = code39[character]
    if (!pattern) throw new Error('Barcode contains a character that cannot be printed.')
    pattern.split('').forEach((width, index) => {
      const size = width === 'w' ? wide : narrow
      if (index % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${size}" height="${height}"/>`)
      x += size
    })
    x += narrow
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Barcode ${barcode}" viewBox="0 0 ${x + quiet} ${height}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/>${bars.join('')}</svg>`
}

export function printInternalBarcode(barcode: string, productName: string) {
  const popup = window.open('', '_blank', 'popup,width=480,height=320')
  if (!popup) throw new Error('Allow the print window to open, then try again.')
  const safeName = productName.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
  popup.document.write(`<!doctype html><html><head><title>Internal barcode label</title><style>@page{size:58mm 32mm;margin:2mm}body{font:12px Arial,sans-serif;text-align:center;margin:0;padding:3mm}.name{font-weight:700;max-height:2.5em;overflow:hidden}svg{width:100%;height:18mm;margin-top:2mm}.code{font:11px monospace;letter-spacing:1px}</style></head><body><div class="name">${safeName}</div>${code39Svg(barcode)}<div class="code">${barcode}</div><script>window.onload=()=>window.print()</script></body></html>`)
  popup.document.close()
  window.setTimeout(() => popup.print(), 250)
}
