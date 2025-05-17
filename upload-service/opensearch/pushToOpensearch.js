import { Client } from "@opensearch-project/opensearch";
const PushToOpenSearch =  async (title, description, author, videoUrl, fileName) => {
   try {
       console.log('Pushing to Open Search');
       // Process video upload and extract metadata
       var host =
"https://hhldclass:Hhldclass1!@search-streaming-os-service-z4wffml2ggw2hymrip44jtunfy.ap-south-1.es.amazonaws.com";
       
       var client = new Client({
           node: host
});
       var index_name = "video";
       var document = {
           title: title,
           author: author,
           description: description,
           videoUrl: videoUrl,
           fileName: fileName,
};
       var response = await client.index({
           id: title, // id should ideally be db id
           index: index_name,
           body: document,
           refresh: true,
       });
       console.log("Adding document:");
       console.log(response.body);
   } catch (error) {
       // Respond with error message
       console.log(error.message)
    } 
};
    export default PushToOpenSearch;