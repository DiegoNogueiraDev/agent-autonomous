#!/usr/bin/env python3
"""
Python OCR Service using Tesseract OCR with enhanced accuracy
Provides REST API for OCR operations with better performance than Tesseract.js
"""

import os
import sys
import json
import logging
import tempfile
import base64
import time
from typing import Dict, List, Any, Optional, Tuple
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
import pytesseract
from flask import Flask, request, jsonify
from werkzeug.serving import make_server
import threading

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class PythonOCRService:
    """Enhanced OCR service using Python Tesseract with preprocessing"""

    def __init__(self, host='localhost', port=5000):
        self.host = host
        self.port = port
        self.app = Flask(__name__)
        self.server = None
        self.server_thread = None

        # Configure routes
        self.setup_routes()

    def setup_routes(self):
        """Setup Flask routes for OCR operations"""

        @self.app.route('/health', methods=['GET'])
        def health_check():
            """Health check endpoint"""
            return jsonify({'status': 'healthy', 'service': 'python-ocr'})

        @self.app.route('/extract', methods=['POST'])
        def extract_text():
            """Extract text from image"""
            try:
                data = request.get_json()
                if not data or 'image' not in data:
                    return jsonify({'error': 'No image data provided'}), 400

                image_data = data['image']
                options = data.get('options', {})

                # Decode base64 image
                if image_data.startswith('data:image'):
                    image_data = image_data.split(',')[1]

                try:
                    image_bytes = base64.b64decode(image_data)
                    if len(image_bytes) == 0:
                        return jsonify({'error': 'Image data is empty'}), 400
                    
                    # Validate image format
                    try:
                        test_image = Image.open(BytesIO(image_bytes))
                        test_image.verify()
                    except Exception as img_err:
                        return jsonify({'error': f'Invalid image format: {str(img_err)}'}), 400
                        
                except Exception as decode_err:
                    return jsonify({'error': f'Failed to decode base64 image: {str(decode_err)}'}), 400

                # Extract text
                result = self.perform_ocr(image_bytes, options)

                return jsonify(result)

            except Exception as e:
                logger.error(f"OCR extraction failed: {str(e)}")
                return jsonify({'error': str(e)}), 500

        @self.app.route('/extract/batch', methods=['POST'])
        def extract_batch():
            """Extract text from multiple images"""
            try:
                data = request.get_json()
                if not data or 'images' not in data:
                    return jsonify({'error': 'No images provided'}), 400

                images = data['images']
                options = data.get('options', {})

                results = []
                for img_data in images:
                    try:
                        # Decode base64 image
                        image_data = img_data.get('image', '')
                        if image_data.startswith('data:image'):
                            image_data = image_data.split(',')[1]

                        if not image_data:
                            raise ValueError('No image data provided')

                        image_bytes = base64.b64decode(image_data)
                        if len(image_bytes) == 0:
                            raise ValueError('Image data is empty')
                        
                        # Validate image format
                        test_image = Image.open(BytesIO(image_bytes))
                        test_image.verify()

                        # Extract text
                        result = self.perform_ocr(image_bytes, options)
                        results.append({
                            'id': img_data.get('id', str(len(results))),
                            'result': result
                        })

                    except Exception as e:
                        results.append({
                            'id': img_data.get('id', str(len(results))),
                            'error': str(e)
                        })

                return jsonify({'results': results})

            except Exception as e:
                logger.error(f"Batch OCR extraction failed: {str(e)}")
                return jsonify({'error': str(e)}), 500

        @self.app.route('/languages', methods=['GET'])
        def get_languages():
            """Get available languages"""
            try:
                languages = self.get_available_languages()
                return jsonify({'languages': languages})
            except Exception as e:
                logger.error(f"Failed to get languages: {str(e)}")
                return jsonify({'error': str(e)}), 500

    def preprocess_image(self, image_bytes: bytes, options: Dict[str, Any]) -> np.ndarray:
        """Preprocess image for better OCR accuracy"""
        try:
            # Convert bytes to PIL Image
            image = Image.open(BytesIO(image_bytes))

            # Convert to RGB if necessary
            if image.mode != 'RGB':
                image = image.convert('RGB')

            # Convert PIL to OpenCV format
            opencv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

            # Apply preprocessing based on options
            if options.get('grayscale', True):
                opencv_image = cv2.cvtColor(opencv_image, cv2.COLOR_BGR2GRAY)

            if options.get('denoise', False):
                opencv_image = cv2.fastNlMeansDenoising(opencv_image)

            if options.get('enhance_contrast', False):
                if len(opencv_image.shape) == 3:
                    # Color image
                    lab = cv2.cvtColor(opencv_image, cv2.COLOR_BGR2LAB)
                    lab[:, :, 0] = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(lab[:, :, 0])
                    opencv_image = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
                else:
                    # Grayscale image
                    opencv_image = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(opencv_image)

            if options.get('threshold', False):
                _, opencv_image = cv2.threshold(opencv_image, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

            if options.get('scale', 1) != 1:
                scale = options['scale']
                width = int(opencv_image.shape[1] * scale)
                height = int(opencv_image.shape[0] * scale)
                opencv_image = cv2.resize(opencv_image, (width, height), interpolation=cv2.INTER_CUBIC)

            # Crop region if specified
            if 'crop_region' in options and options['crop_region']:
                crop = options['crop_region']
                if all(key in crop for key in ['left', 'top', 'width', 'height']):
                    x, y, w, h = crop['left'], crop['top'], crop['width'], crop['height']
                    # Validate crop region bounds
                    img_h, img_w = opencv_image.shape[:2]
                    x = max(0, min(x, img_w))
                    y = max(0, min(y, img_h))
                    w = max(1, min(w, img_w - x))
                    h = max(1, min(h, img_h - y))
                    opencv_image = opencv_image[y:y+h, x:x+w]

            return opencv_image

        except Exception as e:
            logger.error(f"Image preprocessing failed: {str(e)}")
            # Return original image if preprocessing fails
            image = Image.open(BytesIO(image_bytes))
            if image.mode != 'RGB':
                image = image.convert('RGB')
            return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

    def perform_ocr(self, image_bytes: bytes, options: Dict[str, Any]) -> Dict[str, Any]:
        """Perform OCR on image with preprocessing"""
        try:
            # Preprocess image
            processed_image = self.preprocess_image(image_bytes, options)

            # Configure Tesseract
            config_parts = []

            # Language
            language = options.get('language', 'eng')
            config_parts.append(f'-l {language}')

            # Page segmentation mode
            psm = options.get('psm', 6)  # Default: Assume a single uniform block of text
            config_parts.append(f'--psm {psm}')

            # OCR Engine mode
            oem = options.get('oem', 3)  # Default: LSTM only
            config_parts.append(f'--oem {oem}')

            # Character whitelist
            if 'whitelist' in options:
                whitelist = options['whitelist']
                config_parts.append(f'-c tessedit_char_whitelist={whitelist}')

            # Character blacklist
            if 'blacklist' in options:
                blacklist = options['blacklist']
                config_parts.append(f'-c tessedit_char_blacklist={blacklist}')

            config_string = ' '.join(config_parts)

            # Perform OCR
            start_time = time.time()

            # Extract text and data
            data = pytesseract.image_to_data(
                processed_image,
                config=config_string,
                output_type=pytesseract.Output.DICT
            )

            text = pytesseract.image_to_string(processed_image, config=config_string)

            processing_time = int((time.time() - start_time) * 1000)  # Convert to milliseconds

            # Parse word-level data
            words = []
            lines = {}

            n_boxes = len(data['text'])
            for i in range(n_boxes):
                if int(data['conf'][i]) > 0:  # Only include confident words
                    word_data = {
                        'text': data['text'][i],
                        'confidence': float(data['conf'][i]) / 100.0,
                        'bbox': {
                            'x0': int(data['left'][i]),
                            'y0': int(data['top'][i]),
                            'x1': int(data['left'][i]) + int(data['width'][i]),
                            'y1': int(data['top'][i]) + int(data['height'][i])
                        }
                    }
                    words.append(word_data)

                    # Group words by line
                    line_key = data['line_num'][i]
                    if line_key not in lines:
                        lines[line_key] = {
                            'words': [],
                            'bbox': {
                                'x0': int(data['left'][i]),
                                'y0': int(data['top'][i]),
                                'x1': int(data['left'][i]) + int(data['width'][i]),
                                'y1': int(data['top'][i]) + int(data['height'][i])
                            }
                        }
                    lines[line_key]['words'].append(word_data)

            # Create line-level data
            lines_list = []
            for line_num, line_data in sorted(lines.items()):
                line_text = ' '.join([w['text'] for w in line_data['words']])
                line_confidence = sum([w['confidence'] for w in line_data['words']]) / len(line_data['words']) if line_data['words'] else 0

                lines_list.append({
                    'text': line_text,
                    'confidence': line_confidence,
                    'bbox': line_data['bbox']
                })

            # Calculate overall confidence
            overall_confidence = sum([w['confidence'] for w in words]) / len(words) if words else 0

            return {
                'text': text.strip(),
                'confidence': overall_confidence,
                'words': words,
                'lines': lines_list,
                'processingTime': processing_time,
                'language': language,
                'boundingBox': {
                    'x': 0,
                    'y': 0,
                    'width': processed_image.shape[1] if len(processed_image.shape) > 1 else processed_image.shape[0],
                    'height': processed_image.shape[0] if len(processed_image.shape) > 1 else processed_image.shape[1]
                }
            }

        except Exception as e:
            logger.error(f"OCR failed: {str(e)}")
            raise

    def get_available_languages(self) -> List[str]:
        """Get list of available Tesseract languages"""
        try:
            languages = pytesseract.get_languages()
            return languages
        except Exception as e:
            logger.error(f"Failed to get languages: {str(e)}")
            return ['eng', 'por']  # Fallback

    def start(self):
        """Start the OCR service server"""
        try:
            self.server = make_server(self.host, self.port, self.app)
            self.server_thread = threading.Thread(target=self.server.serve_forever)
            self.server_thread.daemon = True
            self.server_thread.start()

            logger.info(f"Python OCR Service started on {self.host}:{self.port}")
            return True

        except Exception as e:
            logger.error(f"Failed to start OCR service: {str(e)}")
            return False

    def stop(self):
        """Stop the OCR service server"""
        try:
            if self.server:
                self.server.shutdown()
                self.server.server_close()
                logger.info("Python OCR Service stopped")
            return True
        except Exception as e:
            logger.error(f"Failed to stop OCR service: {str(e)}")
            return False

# Global service instance
ocr_service = None

def start_service(host='localhost', port=5000):
    """Start the OCR service"""
    global ocr_service
    ocr_service = PythonOCRService(host, port)
    return ocr_service.start()

def stop_service():
    """Stop the OCR service"""
    global ocr_service
    if ocr_service:
        return ocr_service.stop()
    return True

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Python OCR Service')
    parser.add_argument('--host', default='localhost', help='Host to bind to')
    parser.add_argument('--port', type=int, default=5000, help='Port to bind to')

    args = parser.parse_args()

    # Install required packages if not available
    try:
        import cv2
        import numpy as np
        from PIL import Image
        import pytesseract
        from flask import Flask
    except ImportError as e:
        print(f"Missing required packages: {e}")
        print("Install with: pip install opencv-python numpy pillow pytesseract flask")
        sys.exit(1)

    # Check if Tesseract is installed
    try:
        pytesseract.get_tesseract_version()
    except Exception as e:
        print(f"Tesseract not found: {e}")
        print("Install Tesseract OCR: https://github.com/tesseract-ocr/tesseract")
        sys.exit(1)

    # Start service
    if start_service(args.host, args.port):
        print(f"OCR Service running on http://{args.host}:{args.port}")
        print("Press Ctrl+C to stop")
        try:
            while True:
                import time
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down...")
            stop_service()
    else:
        print("Failed to start OCR service")
        sys.exit(1)
