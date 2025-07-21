#!/usr/bin/env node

// Simple test to verify OCR fixes
const fs = require('fs');

// Create a minimal valid PNG image (1x1 pixel)
const minimalPNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk header
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // width=1, height=1
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // bit depth=8, color type=2
  0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk header
  0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00, // pixel data
  0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x49, // IEND chunk
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
]);

console.log('Testing OCR fix...');
console.log('PNG buffer size:', minimalPNG.length);
console.log('PNG header:', minimalPNG.subarray(0, 8).toString('hex'));

// Test the HTTP endpoint directly
async function testOCR() {
  try {
    const base64Image = minimalPNG.toString('base64');
    
    const requestBody = {
      image: `data:image/png;base64,${base64Image}`,
      options: {
        language: 'eng',
        psm: 6,
        oem: 3
      }
    };

    const response = await fetch('http://localhost:5000/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ OCR request successful!');
      console.log('Response:', result);
    } else {
      console.log('❌ OCR request failed:', result);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testOCR();