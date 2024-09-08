const express = require('express');
const nodeHtmlToImage = require('node-html-to-image');
const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const wrapHtmlContent = (html, css) => `
<html>
<head><style>${css || ''}</style></head>
<body>${html}</body>
</html>`;

const imagesFolderPath = path.join(__dirname, 'images');

const createImagesFolder = async () => {
  try {
    await fs.mkdir(imagesFolderPath, { recursive: true });
  } catch (err) {
    console.error('Failed to create images folder:', err);
  }
};

const processQueue = async () => {
  if (queue.length === 0 || isProcessing) return;

  isProcessing = true;
  const { req, res } = queue.shift();

  try {
    await handleImageGeneration(req, res);
  } catch (error) {
    console.error('Error in processQueue:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }

  isProcessing = false;
  processQueue();
};

const handleImageGeneration = async (req, res) => {
  const { html, css, body_width = 800, body_height = 800 } = req.body;

  if (!html) {
    return res.status(400).json({ message: 'HTML content is required' });
  }

  const outputFileName = `image-${uuidv4()}.png`;
  const outputFilePath = path.join(imagesFolderPath, outputFileName);

  try {
    const wrappedHtml = wrapHtmlContent(html, css);
    await generateImage(wrappedHtml, outputFilePath, body_width, body_height);
    const imageUrl = await uploadImage(outputFilePath, outputFileName);
    await fs.unlink(outputFilePath);
    res.json({ imageUrl });
  } catch (error) {
    console.error('Error in handleImageGeneration:', error);
    res.status(500).json({ message: 'Error generating or uploading image', error: error.message });
  }
};

const generateImage = async (html, outputPath, width, height) => {
  await nodeHtmlToImage({
    output: outputPath,
    html,
    puppeteerArgs: {
      defaultViewport: { width, height },
    },
  });
};

const uploadImage = async (filePath, fileName) => {
  const form = new FormData();
  form.append('file', await fs.readFile(filePath), {
    filename: fileName,
    contentType: 'image/png',
  });

  try {
    const response = await axios.post('https://screen.viki-web.com/upload.php', form, {
      headers: {
        ...form.getHeaders(),
        'Content-Type': 'multipart/form-data',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    if (response.data.startsWith('https://')) {
      return response.data.trim();
    } else {
      throw new Error(`Upload failed: ${response.data}`);
    }
  } catch (error) {
    console.error('Error uploading image:', error.message);
    throw new Error('Failed to upload image to server');
  }
};

let queue = [];
let isProcessing = false;

app.post('/generate-image', (req, res) => {
  queue.push({ req, res });
  processQueue();
});

const startServer = async () => {
  await createImagesFolder();
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
};

startServer().catch(console.error);