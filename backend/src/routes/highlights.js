import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import asyncHandler from 'express-async-handler';
import codesRoutes from './codes.js';

export default function highlightsRoutes(pool) {
  return codesRoutes(pool);
}
