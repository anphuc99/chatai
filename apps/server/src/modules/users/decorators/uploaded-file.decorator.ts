import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppException, ERR } from '../../../shared/errors/app-exception';

export interface FastifyFile {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  fieldname: string;
  size: number;
}

export const UploadedFileFastify = createParamDecorator(
  async (data: unknown, ctx: ExecutionContext): Promise<FastifyFile | null> => {
    const req = ctx.switchToHttp().getRequest();
    if (typeof req.isMultipart !== 'function' || !req.isMultipart()) {
      throw new AppException(ERR.INVALID_PAYLOAD as string, 'Yêu cầu phải có dạng multipart/form-data');
    }
    
    let file;
    try {
      file = await req.file();
    } catch (e: any) {
      throw new AppException(ERR.INVALID_PAYLOAD as string, e.message);
    }

    if (!file) {
      return null;
    }

    const buffer = await file.toBuffer();
    return {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
      fieldname: file.fieldname,
      size: buffer.length,
    };
  },
);
