const express = require('express');
const nodeHtmlToImage = require('node-html-to-image');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const { promisify } = require('util');

const unlinkAsync = promisify(fs.unlink);

const app = express();
const port = 3000;

// Middleware to parse JSON request body and enable CORS for frontend requests
app.use(express.json());
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

let queue = [];
let isProcessing = false;

// Function to wrap HTML and CSS content
const wrapHtmlContent = (html, css) => `
<html>
<head><style>${css || ''}</style></head>
<body>
  ${html}
</body>
</html>
`;

// Process the queue
const processQueue = async () => {
  if (queue.length === 0 || isProcessing) return;

  isProcessing = true;

  const { req, res } = queue.shift();
  const { html, css, body_width, body_height } = req.body;

  if (!html) {
    res.status(400).json({ message: 'HTML content is required' });
    isProcessing = false;
    processQueue();
    return;
  }

  const outputFileName = `image-${uuidv4()}.png`;
  const outputFilePath = path.join(__dirname, outputFileName);

  try {
    // Wrap the content in full HTML structure
    const wrappedHtml = wrapHtmlContent(html, css);

    await nodeHtmlToImage({
      output: outputFilePath,
      html: wrappedHtml,
      puppeteerArgs: {
        defaultViewport: {
          width: body_width || 800,
          height: body_height || 800,
        },
      },
    });

    const fileStream = fs.createReadStream(outputFilePath);
    fileStream.on('open', () => {
      res.setHeader('Content-Type', 'image/png');
      fileStream.pipe(res);
    });

    fileStream.on('error', async (err) => {
      res.status(500).send('Error sending image');
      await unlinkAsync(outputFilePath); // Ensure the file is removed on error
    });

    fileStream.on('close', async () => {
      await unlinkAsync(outputFilePath); // Clean up the file after sending
    });

  } catch (error) {
    res.status(500).json({ message: 'Error generating image', error: error.message });
  }

  isProcessing = false;
  processQueue();
};

// API to generate image
app.post('/generate-image', (req, res) => {
  queue.push({ req, res });
  processQueue();
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
