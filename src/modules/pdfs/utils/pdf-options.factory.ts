import * as puppeteer from 'puppeteer';
import { getHeaderTemplate } from './pdf-header-templates';
import { getFooterTemplate } from './pdf-footer-templates';

interface PdfOptionsConfig {
  headerType?: string;
  includeFooter?: boolean;
  logoBase64?: string;
}

export const getPdfOptions = (
  config: PdfOptionsConfig,
): puppeteer.PDFOptions => {
  const {
    headerType = 'default',
    includeFooter = true,
    logoBase64 = '',
  } = config;

  return {
    format: 'A4',
    scale: 1,
    displayHeaderFooter:
      Boolean(logoBase64) || includeFooter || headerType !== 'none',
    headerTemplate: getHeaderTemplate(headerType, logoBase64),
    footerTemplate: getFooterTemplate(includeFooter),
    margin: {
      top: headerType !== 'none' || logoBase64 ? '2.5cm' : '1cm',
      bottom: includeFooter ? '2.5cm' : '1cm',
      left: '2cm',
      right: '1.5cm',
    },
    preferCSSPageSize: true,
    omitBackground: true,
    printBackground: true,
  };
};
