const axios = require('axios');
const logger = require('../utils/logger');

const LANGUAGE_IDS = {
  javascript: 63,
  python: 71,
  java: 62,
  cpp: 54,
  c: 50
};

exports.executeCode = async (req, res) => {
  try {
    const { code, language, stdin } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Code is required' });
    }

    const languageId = LANGUAGE_IDS[language];
    if (!languageId) {
      return res.status(400).json({ message: 'Unsupported language' });
    }

    const apiUrl = process.env.JUDGE0_API_URL || 'https://ce.judge0.com';

    const headers = {
      'Content-Type': 'application/json'
    };
    if (process.env.JUDGE0_API_KEY) {
      if (apiUrl.includes('rapidapi.com')) {
        headers['X-RapidAPI-Key'] = process.env.JUDGE0_API_KEY;
        try {
          headers['X-RapidAPI-Host'] = new URL(apiUrl).hostname;
        } catch {
          headers['X-RapidAPI-Host'] = apiUrl.replace(/^https?:\/\//, '').split('/')[0];
        }
      } else {
        headers['X-Auth-Token'] = process.env.JUDGE0_API_KEY;
      }
    }

    const options = {
      method: 'POST',
      url: `${apiUrl}/submissions`,
      params: { base64_encoded: 'true', fields: '*' },
      headers,
      timeout: 10000,
      data: {
        source_code: Buffer.from(code).toString('base64'),
        language_id: languageId,
        stdin: stdin ? Buffer.from(stdin).toString('base64') : '',
        cpu_time_limit: 5.0, // CPU time limit in seconds
        wall_time_limit: 10.0, // Wall time limit in seconds
        memory_limit: 128000, // Memory limit in kilobytes (128MB)
        max_processes_and_or_threads: 30
      }
    };

    const submitResponse = await axios.request(options);
    const token = submitResponse.data.token;

    // Polling logic
    let result = null;
    let attempts = 0;
    while (attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // sleep 1 second

      const getOptions = {
        method: 'GET',
        url: `${apiUrl}/submissions/${token}`,
        params: { base64_encoded: 'true', fields: '*' },
        headers,
        timeout: 10000
      };

      const getResponse = await axios.request(getOptions);
      const statusId = getResponse.data.status.id;

      // Status >= 3 means execution is done
      if (statusId >= 3) {
        result = getResponse.data;
        break;
      }
      attempts++;
    }

    if (!result) {
      return res.status(408).json({ message: 'Execution timed out' });
    }

    const decodeBase64 = (str) => {
      if (!str) return null;
      return Buffer.from(str, 'base64').toString('utf-8');
    };

    res.status(200).json({
      stdout: decodeBase64(result.stdout),
      stderr: decodeBase64(result.stderr),
      compile_output: decodeBase64(result.compile_output),
      status: result.status.description,
      time: result.time,
      memory: result.memory
    });

  } catch (error) {
    logger.error('Code execution error:', error);
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ message: 'Code execution service timed out' });
    }
    if (error.response) {
      return res.status(500).json({ message: 'Judge0 Error', error: error.response.data });
    }
    res.status(500).json({ message: 'Server error / Execution service unreachable', error: error.message });
  }
};
