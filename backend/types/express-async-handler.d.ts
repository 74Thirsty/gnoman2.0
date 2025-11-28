declare module 'express-async-handler' {
  import type { NextFunction, Request, RequestHandler, Response } from 'express';

  type AsyncRequestHandler<P = any, ResBody = any, ReqBody = any, ReqQuery = any> = (
    req: Request<P, ResBody, ReqBody, ReqQuery>,
    res: Response<ResBody>,
    next: NextFunction
  ) => Promise<unknown> | unknown;

  export default function asyncHandler<P = any, ResBody = any, ReqBody = any, ReqQuery = any>(
    handler: AsyncRequestHandler<P, ResBody, ReqBody, ReqQuery>
  ): RequestHandler<P, ResBody, ReqBody, ReqQuery>;
}
