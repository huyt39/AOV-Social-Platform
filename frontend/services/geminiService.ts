import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const generateHeroGuide = async (heroName: string): Promise<string> => {
  try {
    if (!apiKey) return "Vui lòng cấu hình API KEY.";

    const prompt = `
      Bạn là một huấn luyện viên chuyên nghiệp của game Liên Quân Mobile (Arena of Valor).
      Hãy phân tích ngắn gọn về vị tướng: ${heroName}.
      Bao gồm:
      1. Điểm mạnh/Yếu.
      2. Lối lên trang bị (Build) chuẩn meta hiện tại.
      3. Phù hiệu và Bảng ngọc khuyên dùng.
      4. Mẹo chơi ngắn gọn.
      Định dạng câu trả lời bằng Markdown, ngắn gọn, dễ đọc.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "Không thể lấy dữ liệu.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Đã xảy ra lỗi khi kết nối với Huấn Luyện Viên AI.";
  }
};

export const chatWithCoach = async (message: string, history: {role: string, parts: {text: string}[]}[]): Promise<string> => {
  try {
    if (!apiKey) return "Vui lòng cấu hình API KEY.";

    // Convert history to Gemini format if needed, but for simple generateContent with context, we can just use chat
    // However, using the Chat API is cleaner.
    
    const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction: "Bạn là một trợ lý AI am hiểu sâu sắc về Liên Quân Mobile. Bạn dùng ngôn ngữ 'game thủ' tự nhiên, vui vẻ (dùng các thuật ngữ như gank, farm, ks, ad, sp, ...). Nhiệm vụ của bạn là giúp người chơi leo rank, giải đáp thắc mắc về meta.",
        },
        history: history
    });

    const response = await chat.sendMessage({ message });
    return response.text || "AI đang suy nghĩ...";
  } catch (error) {
    console.error("Chat Error:", error);
    return "Lỗi kết nối với AI.";
  }
};
