import { getFileIcon, pdfIcon, docIcon, xlsIcon, pptxIcon, txtIcon, jpgIcon, pngIcon, movIcon, mp4Icon, mp3Icon } from '../iconMapper';

describe('getFileIcon', () => {
  describe('MIME type priority', () => {
    it('returns pdfIcon for application/pdf', () => {
      expect(getFileIcon('test.pdf', 'application/pdf')).toBe(pdfIcon);
    });

    it('returns docIcon for Word MIME types', () => {
      expect(getFileIcon('', 'application/msword')).toBe(docIcon);
      expect(getFileIcon('', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(docIcon);
    });

    it('returns xlsIcon for Excel MIME types', () => {
      expect(getFileIcon('', 'application/vnd.ms-excel')).toBe(xlsIcon);
      expect(getFileIcon('', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(xlsIcon);
    });

    it('returns pptxIcon for PowerPoint MIME types', () => {
      expect(getFileIcon('', 'application/vnd.ms-powerpoint')).toBe(pptxIcon);
      expect(getFileIcon('', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe(pptxIcon);
    });

    it('returns txtIcon for text MIME types', () => {
      expect(getFileIcon('', 'text/plain')).toBe(txtIcon);
      expect(getFileIcon('', 'text/csv')).toBe(txtIcon);
    });

    it('returns correct icon for image MIME types', () => {
      expect(getFileIcon('', 'image/jpeg')).toBe(jpgIcon);
      expect(getFileIcon('', 'image/png')).toBe(pngIcon);
      expect(getFileIcon('', 'image/gif')).toBe(pngIcon);
      expect(getFileIcon('', 'image/webp')).toBe(pngIcon);
      expect(getFileIcon('', 'image/svg+xml')).toBe(pngIcon);
    });

    it('returns correct icon for video MIME types', () => {
      expect(getFileIcon('', 'video/quicktime')).toBe(movIcon);
      expect(getFileIcon('', 'video/mp4')).toBe(mp4Icon);
    });

    it('returns correct icon for audio MIME types', () => {
      expect(getFileIcon('', 'audio/mpeg')).toBe(mp3Icon);
      expect(getFileIcon('', 'audio/wav')).toBe(mp3Icon);
      expect(getFileIcon('', 'audio/aac')).toBe(mp3Icon);
      expect(getFileIcon('', 'audio/mp4')).toBe(mp3Icon);
    });
  });

  describe('extension fallback', () => {
    it('returns pdfIcon for .pdf extension', () => {
      expect(getFileIcon('report.pdf')).toBe(pdfIcon);
    });

    it('returns docIcon for .docx extension', () => {
      expect(getFileIcon('document.docx')).toBe(docIcon);
      expect(getFileIcon('old.doc')).toBe(docIcon);
    });

    it('returns xlsIcon for .xlsx extension', () => {
      expect(getFileIcon('data.xlsx')).toBe(xlsIcon);
    });

    it('returns pptxIcon for .pptx extension', () => {
      expect(getFileIcon('slides.pptx')).toBe(pptxIcon);
    });

    it('returns jpgIcon for .jpg extension', () => {
      expect(getFileIcon('photo.jpg')).toBe(jpgIcon);
      expect(getFileIcon('photo.jpeg')).toBe(jpgIcon);
    });

    it('returns mp3Icon for audio extensions', () => {
      expect(getFileIcon('song.mp3')).toBe(mp3Icon);
      expect(getFileIcon('audio.wav')).toBe(mp3Icon);
      expect(getFileIcon('audio.m4a')).toBe(mp3Icon);
    });
  });

  describe('fallback', () => {
    it('returns pdfIcon for unknown extension', () => {
      expect(getFileIcon('file.xyz')).toBe(pdfIcon);
    });

    it('returns pdfIcon when no filename and no MIME', () => {
      expect(getFileIcon()).toBe(pdfIcon);
      expect(getFileIcon('', '')).toBe(pdfIcon);
    });
  });
});
