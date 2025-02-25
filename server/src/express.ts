import * as express from 'express';
import { Readable } from 'stream';
import { BlobServiceClient } from '@azure/storage-blob';
import * as https from "https";
import * as fs from "fs";
import { IncomingMessage } from 'http';
const youtubedl = require('youtube-dl-exec')
require('dotenv').config();

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.get('/youtubeRedirect', async (req, res) => {
    try {
        console.log(`Request received for url "${req.url}"`);
        const videoId = req.query.id as string;
        if (!videoId) {
            return res.status(400).send("Please provide a video ID with ?id=.");
        }

        const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_BLOB_CONTAINER_NAME);
        const blockBlobClient = containerClient.getBlockBlobClient(videoId);
        const blobExists = await blockBlobClient.exists();

        if (blobExists) {
            console.log(`Blob "${videoId}" already exists.`);
            return res.redirect(blockBlobClient.url);
        }

        // let agent: ytdl.Agent | undefined;
        // try {
        //     if (process.env.YOUTUBE_COOKIES) {
        //         agent = ytdl.createAgent(JSON.parse(process.env.YOUTUBE_COOKIES));
        //     }
        // } catch (error) {
        //     console.error(`Error parsing youtube cookies: ${error}`);
        // }

        // console.log(`Blob "${videoId}" does not exist. Downloading stream...`);
        // let stream: Readable;
        // let format: ytdl.videoFormat;
        // try {
        //     const options = {
        //         filter: 'audioonly' as ytdl.Filter,
        //         quality: 'highestaudio'
        //     };
        //     const info = await ytdl.getInfo(videoId, { agent: agent });
        //     format = ytdl.chooseFormat(info.formats, options);
        //     console.log(format);
        //     stream = ytdl(videoId, { ...options, agent: agent });
        // } catch (error) {
        //     console.error(`Error getting YouTube info: ${error}`);
        //     return res.status(500).send("Failed to download stream.");
        // }

        let stream: Readable;
        let result: any;
        let url: string, id: string, codec: string;
        try {
            result = await youtubedl.exec('https://www.youtube.com/watch?v=' + videoId,{ f: 'bestaudio', print: '%(urls)s\t%(id)s\t%(acodec)s', o: "tmp/%(id)s.%(acodec)s", 'no-simulate': "" });
            [url, id, codec] = result.stdout.split('\t');
            console.log(url);
            stream = fs.createReadStream(`tmp/${id}.${codec}`);
        } catch (error: unknown) {
            console.error(error);
            console.error(`Error getting Youtube info, stderr: ${result.stderr} stdout: ${result.stdout}`);
            return res.status(500).send("Failed to download stream");
        }
        let mime = 'audio/mpeg';
        switch (codec) {
            case 'opus':
                mime = 'audio/ogg'; // Opus codec in OGG container
                break;
            case 'vorbis':
                mime = 'audio/ogg'; // Vorbis codec in OGG container
                break;
            case 'aac':
                mime = 'audio/aac'; // AAC codec in a raw stream or container
                break;
            case 'flac':
                mime = 'audio/flac'; // FLAC codec
                break;
            case 'mp3':
                mime = 'audio/mpeg'; // MP3 codec
                break;
            case 'webm':
            case 'weba':
                mime = 'audio/webm'; // WebM codec (e.g., Opus or Vorbis in WebM container)
                break;
            case 'wav':
                mime = 'audio/wav'; // WAV format
                break;
            case 'm4a':
                mime = 'audio/mp4'; // M4A container (often AAC)
                break;
            default:
                console.warn(`Unknown codec: ${codec}, defaulting to 'audio/mpeg'`);
                mime = 'audio/mpeg'; // Fallback to a safe default
        }
        
        // Set headers if needed
        res.setHeader('Content-Type', 'audio/ogg'); // Adjust for the content type

        console.log(`Got stream with codec: ${codec} and mime ${mime}`);

        try {
            // Upload stream to blob
            await blockBlobClient.uploadStream(stream, undefined, undefined, {
                blobHTTPHeaders: {
                    blobContentType: mime
                }
            });
            console.log(`Stream uploaded to blob storage as ${videoId} with mimeType ${mime}`);
            return res.redirect(blockBlobClient.url);
        } catch (error) {
            console.error(`Error uploading stream to blob: ${error}`);
            console.error(error);
            console.error(`${error.message}`);
            return res.status(500).send("Failed to create redirect.");
        }
    } catch (error) {
        console.error(`Error: ${error}`);
        return res.status(500).send("Failed to process request.");
    }
});

function deleteOldTmpFiles() {
  const oneHourAgo = Date.now() - (1000 * 60 * 60); // Time threshold (one hour ago)

  fs.readdir('tmp', (err, files) => {
    if (err) {
      console.error('Error reading tmp folder:', err);
      return;
    }

    files.forEach(file => {
      fs.stat('tmp/' + file, (err, stats) => {
        if (err) {
          console.error('Error checking file stats:', err);
          return;
        }

        if (stats.isFile() && stats.mtime.getTime() < oneHourAgo) {
          fs.unlink('tmp/' + file, err => {
            if (err) {
              console.error('Error deleting file:', err);
            } else {
              console.log(`Deleted old file: ${'tmp/' + file}`);
            }
          });
        }
      });
    });
  });
}

// Run the function every hour (1000 ms * 60 s * 60 min)
setInterval(deleteOldTmpFiles, 1000 * 60 * 60);

https.createServer({
    key: fs.readFileSync("/etc/letsencrypt/live/stretto.tplinkdns.com/privkey.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/live/stretto.tplinkdns.com/cert.pem")
}, app).listen(port, '0.0.0.0', undefined, () => {
    console.log(`Server is running on port ${port}`);
});
