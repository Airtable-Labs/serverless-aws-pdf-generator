module.exports = {
  // Used by HTTP API input validation
  REQUIRED_INPUT_KEYS: ['baseId', 'recordId', 'tableId', 'targetAttachmentFieldNameOrId', 'viewId'],

  // Used by PDF generation
  GENERATED_PDF_FILENAME: 'generated.pdf',
  IMAGE_TYPES_TO_PREVIEW: ['image/png', 'image/jpeg'],

  // PDF text styling
  DEFAULT_FONT_SIZE: 14,
  DEFAULT_FONT_REGULAR: 'Helvetica',
  DEFAULT_FONT_BOLD: 'Helvetica-Bold',
  DEFAULT_TEXT_COLOR: '#000000',
  DEFAULT_TEXT_ACCENT_COLOR: '#E89B47'
}
