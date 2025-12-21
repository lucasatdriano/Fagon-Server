import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer';
import Handlebars from '../../../config/handlebars.config';
import chromium from '@sparticuz/chromium';
import { getPdfOptions } from './pdf-options.factory';
import { getPdfConfig } from './pdf-type.utils';

interface GeneratePdfOptions {
  headerType?: string;
  includeFooter?: boolean;
}

export async function generatePdfFromTemplate(
  templateName: string,
  data: any,
  options?: GeneratePdfOptions,
) {
  try {
    const templatePath = path.join(
      __dirname,
      '../templates',
      `${templateName}.hbs`,
    );

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    const templateContent = fs.readFileSync(templatePath, 'utf8');

    let logoBase64 = '';
    const logoPath = path.join(__dirname, '../assets/LogoPDF.png');

    try {
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
      } else {
        console.warn('Logo file not found, proceeding without logo');
      }
    } catch (logoError) {
      console.error('Error loading logo:', logoError);
    }

    const template = Handlebars.compile(templateContent);
    const html = template({ ...data, logoBase64 });

    const browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
      executablePath: await chromium.executablePath(),
      headless: true,
      ignoreHTTPSErrors: true,
    } as puppeteer.LaunchOptions);

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfConfig = getPdfConfig(templateName);
    const mergedOptions = { ...pdfConfig, ...options, logoBase64 };

    const pdfOptions = getPdfOptions(mergedOptions);

    const pdfBuffer = await page.pdf(pdfOptions);
    await browser.close();

    return pdfBuffer;
  } catch (error) {
    console.error('Error in PDF generation:', error);
    throw new Error('Failed to generate PDF');
  }
}
