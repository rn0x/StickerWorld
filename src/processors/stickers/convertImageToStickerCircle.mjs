// /processors/stickers/convertImageToStickerCircle.mjs

import fs from 'fs-extra';
import path from 'path';
import { config } from '../../../config.mjs';
import hasMatchingKeywords from '../../utils/hasMatchingKeywords.mjs';
import convertImageToCircle from '../../utils/convertImageToCircle.mjs';
import { exec } from 'child_process';
import logger from '../../utils/logger.mjs'

export async function convertImageToStickerCircle(message, MessageMedia, messageMeta) {
    try {
        const hasQuotedMsg = message?.hasQuotedMsg;
        const keywords = ["!دائرة", "!دائره", "!circle"];
        const messageBody = message?.body || '';
        const messageCaption = message?._data?.caption || '';
        if (!hasMatchingKeywords(messageBody, keywords) && !hasMatchingKeywords(messageCaption, keywords)) return;

        const targetMessage = hasQuotedMsg ? await message.getQuotedMessage() : message;

        if (!targetMessage.hasMedia) return;  // التأكد من وجود ميديا في الرسالة
        const mediaType = targetMessage?.type;

        let inputPath, outputPath;
        const uniqueId = Date.now(); // لتجنب تداخل الملفات
        const tempDir = config.paths.temp; // مسار مجلد الصور
        inputPath = path.resolve(tempDir, `input-${uniqueId}`); // مسار الصورة المدخلة
        outputPath = path.resolve(tempDir, `output-circle-${uniqueId}.png`); // مسار الصورة الناتجة

        await fs.ensureDir(tempDir);

        if (mediaType === 'image') {
            // إذا كانت الميديا صورة، حفظ الصورة مباشرة
            const media = await targetMessage.downloadMedia();
            await fs.outputFile(inputPath + '.png', media.data, 'base64');
        } else if (mediaType === 'video') {
            // إذا كانت الميديا فيديو، استخراج أول إطار أو عدة إطارات
            const media = await targetMessage.downloadMedia();
            if (media.mimetype !== 'video/mp4') return;

            const tempVideoPath = path.resolve(tempDir, `video-${uniqueId}.mp4`);
            await fs.outputFile(tempVideoPath, media.data, 'base64');

            // استخراج أول إطار من الفيديو (أو 5 إطارات)
            await new Promise((resolve, reject) => {
                const command = `ffmpeg -i ${tempVideoPath} -vf "fps=1" -vframes 1 ${inputPath}.png`;
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        logger.error(`Error extracting frame from video: ${stderr}`);
                        reject(new Error('فشل في استخراج الإطار من الفيديو'));
                    } else {
                        resolve();
                    }
                });
            });

            await fs.remove(tempVideoPath); // حذف الفيديو المؤقت
        }

        // تحويل الصورة (أو الإطار من الفيديو) إلى دائرة باستخدام الوظيفة
        await convertImageToCircle(inputPath + '.png', outputPath);

        // قراءة الصورة الناتجة
        const imageBuffer = await fs.readFile(outputPath);
        const base64Image = imageBuffer.toString('base64');
        const processedMedia = new MessageMedia('image/png', base64Image, 'processed-circle-sticker.png');

        // إرسال الصورة المعدلة كملصق
        await message.reply(processedMedia, undefined, { sendMediaAsSticker: true, stickerAuthor: messageMeta.pushname || messageMeta.number, stickerName: config.stickerName });

        // إرجاع رد للمستخدم
        await message.reply("*تم تحويل الصورة إلى ملصق دائري بنجاح!* 🎁");

        // حذف الملفات المؤقتة
        await fs.remove(inputPath + '.png');
        await fs.remove(outputPath);
    } catch (error) {
        logger.error('Error converting image to circular sticker:', error);
        throw error;
    }
}
