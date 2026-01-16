// Puppeteer script for browser automation
// login to TIM HUB modem and retrieves params:

// $ node login.js
// {
// "internet":{"ipv6_state":"","ipv6_light":"","WAN_IP":"1.1.1.1","ppp_status":"connected","ppp_state":"PPP connected","ppp_light":"green"},
// "broadband":{"dsl":{"status":"Up","status_light":"green","type":"VDSL2","mode":"Fast","uptime":"19 days 10 hours 33 minutes 59 seconds","line_rate":{"upload_mbps":"19.68","download_mbps":"47.06"},"max_line_rate":{"upload_mbps":"19.79","download_mbps":"48.75"},"data_transferred":{"upload_mb":"118804.51","download_mb":"570218.56"},"power":{"upload_dbm":"7.3","download_dbm":"13.1"},"attenuation":{"upload_db":"5.9, 31.5, 50.3, 57.8","download_db":"15.3, 40.0, 65.8"},"noise_margin":{"upload_db":"6.5","download_db":"6.5"}},"vlan":{"id":"835"}}
// }

// apt install nodejs npm chromium-browser
// npm install puppeteer


const puppeteer = require("puppeteer");

const URL = "http://192.168.1.1/";
const INTERNET_URL = "/ajax/internet.lua?auto_update=true";
const BROADBAND_URL = "/modals/broadband-modal.lp";
const USERNAME = "admin";
const PASSWORD = "yourpasswd";

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: '/usr/bin/chromium-browser', // Use system Chromium
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled"
    ]
  });
  
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    await page.goto(URL, { waitUntil: "networkidle2" });

    await page.evaluate(() => {
      document.querySelector("#srp_username").value = "";
      document.querySelector("#srp_password").value = "";
    });
    
    await page.type("#srp_username", USERNAME, { delay: 50 });
    await page.type("#srp_password", PASSWORD, { delay: 50 });

    const authPromise = page.waitForResponse(
      response => response.url().includes('/authenticate') && response.request().method() === 'POST',
      { timeout: 15000 }
    );
    
    await page.click("#sign-me-in");
    
    const authResponse = await authPromise;
    const authStatus = authResponse.status();
    
    if (authStatus !== 200) {
      throw new Error(`Authentication failed with status ${authStatus}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Fetch both endpoints in parallel
    const combinedData = await page.evaluate(async (internetUrl, broadbandUrl) => {
      // Helper function to parse upload/download values
      const parseUpDown = (text) => {
        text = text.replace(/\s+/g, ' ').trim();
        const match = text.match(/([\d.]+)\s*(\w+).*?([\d.]+)\s*(\w+)/);
        if (match) {
          return {
            upload: match[1],
            download: match[3]
          };
        }
        return { upload: '', download: '' };
      };
      
      // Helper to get element by id with spaces
      const getTextByIdWithSpaces = (doc, id) => {
        const elem = doc.querySelector(`[id="${id}"]`);
        return elem ? elem.textContent.trim() : '';
      };
      
      // Fetch internet data
      const internetRes = await fetch(internetUrl, {
        credentials: "same-origin"
      });
      
      if (!internetRes.ok) {
        throw new Error(`Internet endpoint failed: ${internetRes.status}`);
      }
      
      const internetData = await internetRes.json();
      
      // Fetch broadband data
      const broadbandRes = await fetch(broadbandUrl, {
        credentials: "same-origin"
      });
      
      if (!broadbandRes.ok) {
        throw new Error(`Broadband endpoint failed: ${broadbandRes.status}`);
      }
      
      const broadbandHtml = await broadbandRes.text();
      
      // Parse HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(broadbandHtml, 'text/html');
      
      // Extract all the data using ENGLISH IDs
      const dslStatusText = getTextByIdWithSpaces(doc, 'DSL Status');
      const dslType = getTextByIdWithSpaces(doc, 'DSL Type');
      const dslMode = getTextByIdWithSpaces(doc, 'DSL Mode');
      const dslUptime = getTextByIdWithSpaces(doc, 'dsl_uptime');
      const maxLineRateText = getTextByIdWithSpaces(doc, 'Maximum Line rate');
      const lineRateText = getTextByIdWithSpaces(doc, 'dsl_linerate');
      const dataTransferredText = getTextByIdWithSpaces(doc, 'Data Transferred');
      const powerText = getTextByIdWithSpaces(doc, 'Output Power');
      const attenuationText = getTextByIdWithSpaces(doc, 'Line Attenuation');
      const noiseMarginText = getTextByIdWithSpaces(doc, 'Noise Margin');
      const vlanId = getTextByIdWithSpaces(doc, 'VLAN ID');
      
      // Parse numeric values
      const lineRate = parseUpDown(lineRateText);
      const maxLineRate = parseUpDown(maxLineRateText);
      const transferred = parseUpDown(dataTransferredText);
      const power = parseUpDown(powerText);
      const margin = parseUpDown(noiseMarginText);
      
      // Parse attenuation
      const attenuationMatch = attenuationText.match(/([\d.,\s]+)\s*dB.*?([\d.,\s]+)\s*dB/);
      const uploadAttenuation = attenuationMatch ? attenuationMatch[1].trim() : '';
      const downloadAttenuation = attenuationMatch ? attenuationMatch[2].trim() : '';
      
      // Get DSL status light
      const dslStatusLightElem = doc.getElementById('DSL_Status_Id');
      const dslStatusLight = dslStatusLightElem?.className.includes('green') ? 'green' : 
                            dslStatusLightElem?.className.includes('red') ? 'red' : 
                            dslStatusLightElem?.className.includes('orange') ? 'orange' : 'unknown';
      
      return {
        internet: internetData,
        broadband: {
          dsl: {
            status: dslStatusText.replace(/\s+/g, ' '),
            status_light: dslStatusLight,
            type: dslType,
            mode: dslMode,
            uptime: dslUptime,
            line_rate: {
              upload_mbps: lineRate.upload,
              download_mbps: lineRate.download
            },
            max_line_rate: {
              upload_mbps: maxLineRate.upload,
              download_mbps: maxLineRate.download
            },
            data_transferred: {
              upload_mb: transferred.upload,
              download_mb: transferred.download
            },
            power: {
              upload_dbm: power.upload,
              download_dbm: power.download
            },
            attenuation: {
              upload_db: uploadAttenuation,
              download_db: downloadAttenuation
            },
            noise_margin: {
              upload_db: margin.upload,
              download_db: margin.download
            }
          },
          vlan: {
            id: vlanId
          }
        }
      };
    }, INTERNET_URL, BROADBAND_URL);

    await browser.close();
    
    console.log(JSON.stringify(combinedData));
    process.exit(0);

  } catch (err) {
    await browser.close();
    console.log(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
})();
