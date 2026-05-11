// Mock storage service for prototype
// In production, this would use Lovable Cloud database and storage

export interface Chat {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageSource {
  docId: string;
  docTitle?: string;
  chunkIndex: number;
  preview: string;
}

export interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: MessageSource[];
}

export interface Document {
  id: string;
  userId: string;
  title: string;
  content: string;
  fileType: string;
  uploadedAt: string;
  isGeneral?: boolean; // For admin general medical documents
}

export interface MLParams {
  retrieverModel: string;
  retrieverTopK: number;
  retrieverMinScore: number;
  generatorModel: string;
  generatorTemperature: number;
  generatorMaxTokens: number;
}

const CHATS_KEY = 'medical_chats';
const MESSAGES_KEY = 'medical_messages';
const DOCUMENTS_KEY = 'medical_documents';
const ML_PARAMS_KEY = 'medical_ml_params';

const defaultMLParams: MLParams = {
  retrieverModel: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  retrieverTopK: 5,
  retrieverMinScore: 0.3,
  generatorModel: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
  generatorTemperature: 0.4,
  generatorMaxTokens: 512,
};

export const storageService = {
  // Chats
  getChats(userId: string): Chat[] {
    const chats = localStorage.getItem(CHATS_KEY);
    const allChats: Chat[] = chats ? JSON.parse(chats) : [];
    return allChats.filter(c => c.userId === userId);
  },

  saveChat(chat: Chat): void {
    const chats = localStorage.getItem(CHATS_KEY);
    const allChats: Chat[] = chats ? JSON.parse(chats) : [];
    const index = allChats.findIndex(c => c.id === chat.id);
    
    if (index >= 0) {
      allChats[index] = chat;
    } else {
      allChats.push(chat);
    }
    
    localStorage.setItem(CHATS_KEY, JSON.stringify(allChats));
  },

  deleteChat(chatId: string): void {
    const chats = localStorage.getItem(CHATS_KEY);
    const allChats: Chat[] = chats ? JSON.parse(chats) : [];
    const filtered = allChats.filter(c => c.id !== chatId);
    localStorage.setItem(CHATS_KEY, JSON.stringify(filtered));
    
    // Also delete messages
    const messages = this.getMessages(chatId);
    messages.forEach(m => this.deleteMessage(m.id));
  },

  // Messages
  getMessages(chatId: string): Message[] {
    const messages = localStorage.getItem(MESSAGES_KEY);
    const allMessages: Message[] = messages ? JSON.parse(messages) : [];
    return allMessages.filter(m => m.chatId === chatId);
  },

  saveMessage(message: Message): void {
    const messages = localStorage.getItem(MESSAGES_KEY);
    const allMessages: Message[] = messages ? JSON.parse(messages) : [];
    allMessages.push(message);
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
  },

  deleteMessage(messageId: string): void {
    const messages = localStorage.getItem(MESSAGES_KEY);
    const allMessages: Message[] = messages ? JSON.parse(messages) : [];
    const filtered = allMessages.filter(m => m.id !== messageId);
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(filtered));
  },

  // Documents
  getDocuments(userId: string): Document[] {
    const docs = localStorage.getItem(DOCUMENTS_KEY);
    const allDocs: Document[] = docs ? JSON.parse(docs) : [];
    return allDocs.filter(d => d.userId === userId && !d.isGeneral);
  },

  getGeneralDocuments(): Document[] {
    const docs = localStorage.getItem(DOCUMENTS_KEY);
    const allDocs: Document[] = docs ? JSON.parse(docs) : [];
    return allDocs.filter(d => d.isGeneral);
  },

  saveDocument(doc: Document): void {
    const docs = localStorage.getItem(DOCUMENTS_KEY);
    const allDocs: Document[] = docs ? JSON.parse(docs) : [];
    const index = allDocs.findIndex(d => d.id === doc.id);
    
    if (index >= 0) {
      allDocs[index] = doc;
    } else {
      allDocs.push(doc);
    }
    
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(allDocs));
  },

  getAllDocuments(): Document[] {
    const docs = localStorage.getItem(DOCUMENTS_KEY);
    return docs ? JSON.parse(docs) : [];
  },

  deleteDocument(docId: string): void {
    const docs = localStorage.getItem(DOCUMENTS_KEY);
    const allDocs: Document[] = docs ? JSON.parse(docs) : [];
    const filtered = allDocs.filter(d => d.id !== docId);
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(filtered));
  },

  // ML Parameters
  getMLParams(): MLParams {
    const params = localStorage.getItem(ML_PARAMS_KEY);
    return params ? { ...defaultMLParams, ...JSON.parse(params) } : defaultMLParams;
  },

  saveMLParams(params: MLParams): void {
    localStorage.setItem(ML_PARAMS_KEY, JSON.stringify(params));
  },
};
