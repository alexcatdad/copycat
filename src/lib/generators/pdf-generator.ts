import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { OCRResult, PageImage } from '../types';

export async function generateSearchablePdf(
  results: OCRResult[],
  pages: PageImage[],
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pages.length; i++) {
    const pageImage = pages[i];
    const result = results[i];
    if (!result) continue;

    // Embed the original scanned image
    let embeddedImage;
    try {
      const imageBytes = dataUrlToBytes(pageImage.dataUrl);
      if (pageImage.dataUrl.includes('image/png')) {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
      } else {
        embeddedImage = await pdfDoc.embedJpg(imageBytes);
      }
    } catch {
      // If image embedding fails, create a blank page
      pdfDoc.addPage([pageImage.width, pageImage.height]);
      continue;
    }

    const page = pdfDoc.addPage([pageImage.width, pageImage.height]);

    // Draw the original image as the visible layer
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: pageImage.width,
      height: pageImage.height,
    });

    // Overlay invisible text at bounding box positions
    for (const region of result.regions) {
      const [x, y, w, h] = region.bbox;
      const fontSize = Math.max(4, h * 0.8);

      // PDF coordinates: origin is bottom-left, image coordinates: origin is top-left
      const pdfY = pageImage.height - y - h;

      page.drawText(region.text, {
        x,
        y: pdfY,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        opacity: 0, // Invisible text
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  if (!base64) return new Uint8Array(0);
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
