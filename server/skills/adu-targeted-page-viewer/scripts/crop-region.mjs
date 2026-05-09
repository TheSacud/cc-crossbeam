import Jimp from 'jimp'

function parseInteger(value, label) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
  return parsed
}

async function main() {
  const [, , inputPath, outputPath, xArg, yArg, wArg, hArg] = process.argv

  if (!inputPath || !outputPath || !xArg || !yArg || !wArg || !hArg) {
    throw new Error('Usage: node crop-region.mjs <input> <output> <x> <y> <width> <height>')
  }

  const x = parseInteger(xArg, 'x')
  const y = parseInteger(yArg, 'y')
  const width = parseInteger(wArg, 'width')
  const height = parseInteger(hArg, 'height')

  const image = await Jimp.read(inputPath)
  const cropWidth = Math.min(width, image.bitmap.width - x)
  const cropHeight = Math.min(height, image.bitmap.height - y)

  if (cropWidth <= 0 || cropHeight <= 0) {
    throw new Error('Crop rectangle is outside image bounds')
  }

  await image
    .clone()
    .crop(x, y, cropWidth, cropHeight)
    .writeAsync(outputPath)

  process.stdout.write(`${outputPath}\n`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
