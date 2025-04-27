import AWS from 'aws-sdk';
import fs from 'fs'


const uploadFileToS3 = async(req, res) => {
    console.log(req.files)
    if(!req.files || !req.files['chunk'] || !req.body['totalChunks'] || !req.body['chunkIndex']) {
        console.log("Missing Required Data");
        return res.status(400).send("Missing required data");
    }
    const file = req.file;
 
    const chunk = req.files['chunk'];
    const filename = req.body['filename'];
    const totalChunks = req.body['totalChunks'];
    const chunkIndex = req.body['chunkIndex'];
    console.log(filename)

   AWS.config.update({
       region: 'ap-south-1',
       accessKeyId: process.env.AWS_ACCESS_KEY_ID,
       secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
   });


   const params = {
       Bucket: process.env.AWS_BUCKET,
       Key: file.originalname,
       Body: file.buffer
   };


   const s3 = new AWS.S3();


   // Upload the file to S3
   s3.upload(params, (err, data) => {
       if (err) {
           console.log('Error uploading file:', err);
           res.status(404).send('File could not be uploaded!');
       } else {
           console.log('File uploaded successfully. File location:', data.Location);
           res.status(200).send('File uploaded successfully');
       }
   });
}


export default uploadFileToS3;