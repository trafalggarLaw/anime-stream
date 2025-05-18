import dotenv from "dotenv";
import AWS from "aws-sdk";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffprobeStatic from "ffprobe-static";
import ffmpegStatic from "ffmpeg-static";
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);


dotenv.config();

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const bucketName = process.env.AWS_BUCKET;

const s3ToS3 = async (filename) => {
    const mp4FileName = filename;
    const hlsFolder = "/tmp/hls"; // safer on Render
    fs.mkdirSync(hlsFolder, { recursive: true });

    console.log("Starting script");
    console.time("req_time");

    try {
        console.log("Downloading s3 mp4 file locally");
        const mp4FilePath = `${filename}`;
        const writeStream = fs.createWriteStream("local.mp4");
        const readStream = s3
            .getObject({ Bucket: bucketName, Key: mp4FilePath })
            .createReadStream();

        readStream.pipe(writeStream);

        await new Promise((resolve, reject) => {
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
        });

        console.log("Downloaded s3 mp4 file locally");

        if (!fs.existsSync(hlsFolder)) {
            fs.mkdirSync(hlsFolder);
        }

        // 🔍 Check file validity
        await new Promise((resolve, reject) => {
            ffmpeg.ffprobe("local.mp4", (err, metadata) => {
                if (err) {
                    console.error("ffprobe error:", err);
                    return reject(err);
                }
                console.log("FFmpeg metadata:", metadata.format);
                resolve();
            });
        });

        const resolutions = [
            {
                resolution: "320x180",
                videoBitrate: "500k",
                audioBitrate: "64k",
            },
            {
                resolution: "854x480",
                videoBitrate: "1000k",
                audioBitrate: "128k",
            },
            {
                resolution: "1280x720",
                videoBitrate: "2500k",
                audioBitrate: "192k",
            },
        ];

        const variantPlaylists = [];

        for (const { resolution, videoBitrate, audioBitrate } of resolutions) {
            console.log(`HLS conversion starting for ${resolution}`);
            const outputFileName = `${mp4FileName.replace(
                ".",
                "_"
            )}_${resolution}.m3u8`;
            const segmentFileName = `${mp4FileName.replace(
                ".",
                "_"
            )}_${resolution}_%03d.ts`;

            await new Promise((resolve, reject) => {
                ffmpeg("local.mp4")
                    .outputOptions([
                        "-c:v h264",
                        `-b:v ${videoBitrate}`,
                        "-c:a aac",
                        `-b:a ${audioBitrate}`,
                        `-vf scale=${resolution}:force_original_aspect_ratio=decrease,pad=${resolution}:(ow-iw)/2:(oh-ih)/2`,
                        "-f hls",
                        "-hls_time 10",
                        "-hls_list_size 0",
                        `-hls_segment_filename ${hlsFolder}/${segmentFileName}`,
                    ])
                    .output(`${hlsFolder}/${outputFileName}`)
                    .on("start", (commandLine) => {
                        console.log("FFmpeg command:", commandLine);
                    })
                    .on("stderr", (stderrLine) => {
                        console.log("FFmpeg stderr:", stderrLine);
                    })
                    .on("end", () => {
                        console.log(`HLS conversion done for ${resolution}`);
                        resolve();
                    })
                    .on("error", (err) => {
                        console.error(`FFmpeg error for ${resolution}:`, err);
                        reject(err);
                    })
                    .run();
            });

            variantPlaylists.push({ resolution, outputFileName });
        }

        console.log(`HLS master m3u8 playlist generating`);

        let masterPlaylist = variantPlaylists
            .map(({ resolution, outputFileName }) => {
                const bandwidth =
                    resolution === "320x180"
                        ? 676800
                        : resolution === "854x480"
                        ? 1353600
                        : 3230400;
                return `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}\n${outputFileName}`;
            })
            .join("\n");

        masterPlaylist = `#EXTM3U\n` + masterPlaylist;

        const masterPlaylistFileName = `${mp4FileName.replace(
            ".",
            "_"
        )}_master.m3u8`;
        const masterPlaylistPath = `${hlsFolder}/${masterPlaylistFileName}`;

        fs.writeFileSync(masterPlaylistPath, masterPlaylist);
        console.log("HLS master m3u8 playlist generated");

        console.log("Deleting locally downloaded s3 mp4 file");
        fs.unlinkSync("local.mp4");

        console.log("Uploading media m3u8 playlists and ts segments to s3");

        const files = fs.readdirSync(hlsFolder);
        for (const file of files) {
            if (!file.startsWith(mp4FileName.replace(".", "_"))) {
                continue;
            }

            const filePath = path.join(hlsFolder, file);
            const fileStream = fs.createReadStream(filePath);

            const uploadParams = {
                Bucket: bucketName,
                Key: `${hlsFolder}/${file}`,
                Body: fileStream,
                ContentType: file.endsWith(".ts")
                    ? "video/mp2t"
                    : file.endsWith(".m3u8")
                    ? "application/x-mpegURL"
                    : null,
            };

            await s3.upload(uploadParams).promise();
            fs.unlinkSync(filePath);
        }

        console.log(
            "Uploaded media m3u8 playlists and ts segments to s3. Also deleted locally"
        );

        console.log("Success. Time taken:");
        console.timeEnd("req_time");
    } catch (error) {
        console.error("Error:", error);
    }
};

export default s3ToS3;
