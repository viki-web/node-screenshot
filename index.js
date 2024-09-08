const express = require('express');
const nodeHtmlToImage = require('node-html-to-image');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

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

  const outputFileName = `image-${uuidv4()}.png`;

  try {
    // Wrap the content in full HTML structure
    const wrappedHtml = wrapHtmlContent(html, css);

    await nodeHtmlToImage({
      output: `./${outputFileName}`,
      html: wrappedHtml,
      puppeteerArgs: {
        defaultViewport: {
          width: body_width || 800,
          height: body_height || 800,
        },
      },
    });

    const filePath = path.join(__dirname, outputFileName);
    const fileStream = fs.createReadStream(filePath);
    fileStream.on('open', () => {
      res.setHeader('Content-Type', 'image/png');
      fileStream.pipe(res);
    });

    fileStream.on('error', (err) => {
      res.status(500).send('Error sending image');
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
