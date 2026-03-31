import { Router } from 'express';
import multer from 'multer';
import { handleUpload, handleStatus } from '../controllers/documentController';

const router = Router();
const upload = multer({ dest: './uploads/' });

router.post('/documents/upload', upload.single('file'), handleUpload);
router.get('/documents/:jobId/status', handleStatus);

export default router;
