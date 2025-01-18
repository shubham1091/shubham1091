const apiUrl = "https://opbento.edgexhq.tech/api/bento?n=Shubham&g=shubham1091&x=smithofcode&l=shubham-real&i=https%3A%2F%2Favatars.githubusercontent.com%2Fu%2F96609435%3Fv%3D4&p=&z=d7afa";
interface BentoResponse {
  url: string;
}

const fetchBentoUrl = async (apiUrl: string): Promise<string> => {
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: BentoResponse = (await response.json()) as BentoResponse;
    return data.url;
  } catch (error) {
    console.error("Error fetching Bento URL:", error);
    throw error;
  }
};

// @ts-ignore
fetchBentoUrl(apiUrl);
