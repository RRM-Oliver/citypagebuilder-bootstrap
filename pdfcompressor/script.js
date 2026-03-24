const { PDFDocument } = PDFLib;

// Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const editorSection = document.getElementById('editor-section');
const originalFilenameEl = document.getElementById('original-filename');
const originalSizeEl = document.getElementById('original-size');
const targetFilenameInput = document.getElementById('target-filename');
const qualitySlider = document.getElementById('quality-slider');
const qualityValue = document.getElementById('quality-value');
const processBtn = document.getElementById('process-btn');
const removeFileBtn = document.getElementById('remove-file');

// Meta fields
const metaFields = {
    title: document.getElementById('meta-title'),
    author: document.getElementById('meta-author'),
    subject: document.getElementById('meta-subject'),
    keywords: document.getElementById('meta-keywords'),
    creator: document.getElementById('meta-creator'),
    producer: document.getElementById('meta-producer')
};

let currentFile = null;
let currentPdf = null;

// Drag and drop handlers
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

qualitySlider.addEventListener('input', (e) => {
    qualityValue.textContent = `${e.target.value}%`;
});

removeFileBtn.addEventListener('click', resetEditor);

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function handleFile(file) {
    if (file.type !== 'application/pdf') {
        alert('Please upload a PDF file.');
        return;
    }

    currentFile = file;
    originalFilenameEl.textContent = file.name;
    originalSizeEl.textContent = formatSize(file.size);
    
    // Set default target filename
    const nameWithoutExt = file.name.replace(/\.pdf$/i, '');
    targetFilenameInput.value = `${nameWithoutExt}-compressed`;

    try {
        const arrayBuffer = await file.arrayBuffer();
        currentPdf = await PDFDocument.load(arrayBuffer);
        
        // Load existing metadata
        metaFields.title.value = currentPdf.getTitle() || '';
        metaFields.author.value = currentPdf.getAuthor() || '';
        metaFields.subject.value = currentPdf.getSubject() || '';
        metaFields.keywords.value = (currentPdf.getKeywords() || '').split(';').join(', ');
        metaFields.creator.value = currentPdf.getCreator() || '';
        metaFields.producer.value = currentPdf.getProducer() || '';

        dropZone.classList.add('hidden');
        editorSection.classList.remove('hidden');
    } catch (err) {
        console.error('Error loading PDF:', err);
        alert('Could not load PDF metadata. The file might be corrupted or encrypted.');
    }
}

function resetEditor() {
    currentFile = null;
    currentPdf = null;
    fileInput.value = '';
    dropZone.classList.remove('hidden');
    editorSection.classList.add('hidden');
}

// Initialize pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

async function processPdf() {
    if (!currentPdf || !currentFile) return;

    const btnText = processBtn.querySelector('.btn-text');
    const loader = processBtn.querySelector('.loader');
    const quality = parseInt(qualitySlider.value) / 100;

    try {
        processBtn.disabled = true;
        btnText.textContent = 'Processing...';
        loader.classList.remove('hidden');

        // 1. Load PDF for rendering using pdf.js
        const arrayBuffer = await currentFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;
        
        // 2. Setup jsPDF (using pt units consistent with PDF)
        const { jsPDF } = window.jspdf;
        let finalPdfDoc = null;

        for (let i = 1; i <= numPages; i++) {
            btnText.textContent = `Processing Page ${i}/${numPages}...`;
            
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 }); // 1.5x scale for decent quality
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            // Convert canvas to compressed image
            const imgData = canvas.toDataURL('image/jpeg', quality);

            // Initialize or add page to jsPDF
            const orientation = viewport.width > viewport.height ? 'l' : 'p';
            if (i === 1) {
                finalPdfDoc = new jsPDF({
                    orientation: orientation,
                    unit: 'pt',
                    format: [viewport.width, viewport.height]
                });
            } else {
                finalPdfDoc.addPage([viewport.width, viewport.height], orientation);
            }

            finalPdfDoc.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);
        }

        // 3. Output as ArrayBuffer to re-apply metadata via pdf-lib
        const pdfOutput = finalPdfDoc.output('arraybuffer');
        const metaPdf = await PDFDocument.load(pdfOutput);

        // 4. Apply metadata updates
        metaPdf.setTitle(metaFields.title.value);
        metaPdf.setAuthor(metaFields.author.value);
        metaPdf.setSubject(metaFields.subject.value);
        metaPdf.setKeywords(metaFields.keywords.value.split(',').map(k => k.trim()).filter(k => k));
        metaPdf.setCreator(metaFields.creator.value);
        metaPdf.setProducer(metaFields.producer.value);

        const pdfBytes = await metaPdf.save();

        // Download
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        let filename = targetFilenameInput.value.trim() || 'compressed';
        if (!filename.toLowerCase().endsWith('.pdf')) {
            filename += '.pdf';
        }
        link.download = filename;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch (err) {
        console.error('Error processing PDF:', err);
        alert('An error occurred while processing the PDF: ' + err.message);
    } finally {
        processBtn.disabled = false;
        btnText.textContent = 'Compress & Download';
        loader.classList.add('hidden');
    }
}

processBtn.addEventListener('click', processPdf);
