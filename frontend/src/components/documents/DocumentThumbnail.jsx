import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfIcon from '../assets/pdf-icon.png';
import docIcon from '../assets/doc-icon.png';
import txtIcon from '../assets/txt-icon.png';
import xlsIcon from '../assets/xls.png';
import jpgIcon from '../assets/jpg-icon.png';
import pngIcon from '../assets/png-icon.png';
import pptxIcon from '../assets/pptx.png';
import movIcon from '../assets/mov.png';
import mp4Icon from '../assets/mp4.png';
import mp3Icon from '../assets/mp3.svg';
import { hasCanvasSupport, safeCanvasOperation } from '../utils/browserUtils';

// Set PDF.js worker - use jsdelivr CDN matching the installed pdfjs-dist version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const DocumentThumbnail = ({ document, width = 120, height = 160, showIcon = false }) => {
    const [thumbnail, setThumbnail] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const canvasRef = useRef(null);

    const getFileExtension = (filename) => {
        return filename.toLowerCase().split('.').pop();
    };

    const getFileIcon = (filename) => {
        const ext = getFileExtension(filename);
        const iconMap = {
            'pdf': pdfIcon,
            'doc': docIcon,
            'docx': docIcon,
            'xls': xlsIcon,
            'xlsx': xlsIcon,
            'txt': txtIcon,
            'jpg': jpgIcon,
            'jpeg': jpgIcon,
            'png': pngIcon,
            'ppt': pptxIcon,
            'pptx': pptxIcon,
            'mov': movIcon,
            'mp4': mp4Icon,
            'mp3': mp3Icon,
        };
        return iconMap[ext] || docIcon;
    };

    const isImageFile = (filename) => {
        const ext = getFileExtension(filename);
        return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    };

    const isPDFFile = (filename) => {
        return getFileExtension(filename) === 'pdf';
    };

    const generatePDFThumbnail = async (blob) => {
        try {
            setLoading(true);
            setError(false);

            // Create object URL from blob
            const url = URL.createObjectURL(blob);

            // Load PDF document
            const loadingTask = pdfjsLib.getDocument(url);
            const pdf = await loadingTask.promise;

            // Get first page
            const page = await pdf.getPage(1);

            // Calculate scale to fit thumbnail dimensions
            const viewport = page.getViewport({ scale: 1 });
            const scale = Math.min(width / viewport.width, height / viewport.height);
            const scaledViewport = page.getViewport({ scale });

            // Prepare canvas
            const canvas = canvasRef.current;
            if (!canvas) return;

            const context = canvas.getContext('2d');
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;

            // Render PDF page to canvas
            await page.render({
                canvasContext: context,
                viewport: scaledViewport,
            }).promise;

            // Convert canvas to data URL
            const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            setThumbnail(thumbnailDataUrl);

            // Clean up
            URL.revokeObjectURL(url);
            setLoading(false);
        } catch (err) {

            setError(true);
            setLoading(false);
        }
    };

    const generateImageThumbnail = async (blob) => {
        try {
            setLoading(true);
            setError(false);

            const url = URL.createObjectURL(blob);
            const img = new Image();

            img.onload = () => {
                const canvas = canvasRef.current;
                if (!canvas) return;

                const context = canvas.getContext('2d');

                // Calculate dimensions to fit within thumbnail size
                let drawWidth = width;
                let drawHeight = height;
                let offsetX = 0;
                let offsetY = 0;

                const imgAspect = img.width / img.height;
                const thumbAspect = width / height;

                if (imgAspect > thumbAspect) {
                    // Image is wider
                    drawWidth = height * imgAspect;
                    offsetX = -(drawWidth - width) / 2;
                } else {
                    // Image is taller
                    drawHeight = width / imgAspect;
                    offsetY = -(drawHeight - height) / 2;
                }

                canvas.width = width;
                canvas.height = height;

                // Draw image
                context.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

                // Convert to data URL
                const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.85);
                setThumbnail(thumbnailDataUrl);

                URL.revokeObjectURL(url);
                setLoading(false);
            };

            img.onerror = () => {
                setError(true);
                setLoading(false);
                URL.revokeObjectURL(url);
            };

            img.src = url;
        } catch (err) {

            setError(true);
            setLoading(false);
        }
    };

    useEffect(() => {
        // Only generate thumbnails for PDFs and images
        if (!document) return;

        const generateThumbnail = async () => {
            try {
                // Download and decrypt the document
                const token = localStorage.getItem('accessToken');
                const response = await fetch(`${process.env.REACT_APP_API_URL}/api/documents/${document.id}/download`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    throw new Error('Failed to download document');
                }

                const data = await response.json();

                // Fetch the file from the signed URL
                const fileResponse = await fetch(data.url);
                const encryptedBlob = await fileResponse.blob();

                // Decrypt the file (you'll need to implement this based on your encryption method)
                // For now, assuming the blob is already decrypted or we skip encryption for thumbnails
                const decryptedBlob = encryptedBlob; // TODO: Implement decryption

                // Generate thumbnail based on file type
                if (isPDFFile(document.filename)) {
                    await generatePDFThumbnail(decryptedBlob);
                } else if (isImageFile(document.filename)) {
                    await generateImageThumbnail(decryptedBlob);
                }
            } catch (err) {

                setError(true);
            }
        };

        // Only generate thumbnail if not showing icon and file type is supported
        if (!showIcon && (isPDFFile(document.filename) || isImageFile(document.filename))) {
            generateThumbnail();
        }
    }, [document, showIcon]);

    // Show file type icon
    if (showIcon || error || (!isPDFFile(document.filename) && !isImageFile(document.filename))) {
        return (
            <div
                style={{
                    width,
                    height,
                    background: '#F3F4F6',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                }}
            >
                <img
                    src={getFileIcon(document.filename)}
                    alt={document.filename}
                    style={{
                        width: 60,
                        height: 60,
                        objectFit: 'contain',
                    }}
                />
            </div>
        );
    }

    // Show loading state
    if (loading) {
        return (
            <div
                style={{
                    width,
                    height,
                    background: '#F3F4F6',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <div
                    style={{
                        width: 24,
                        height: 24,
                        border: '3px solid #E5E7EB',
                        borderTop: '3px solid #181818',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                    }}
                />
            </div>
        );
    }

    // Show generated thumbnail
    if (thumbnail) {
        return (
            <div
                style={{
                    width,
                    height,
                    background: '#F3F4F6',
                    borderRadius: 8,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <img
                    src={thumbnail}
                    alt={document.filename}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'top',
                    }}
                />
                {/* Hidden canvas for rendering */}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
        );
    }

    // Fallback: show canvas (for debugging) or icon
    return (
        <div
            style={{
                width,
                height,
                background: '#F3F4F6',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <img
                src={getFileIcon(document.filename)}
                alt={document.filename}
                style={{
                    width: 60,
                    height: 60,
                    objectFit: 'contain',
                }}
            />
        </div>
    );
};

export default DocumentThumbnail;
