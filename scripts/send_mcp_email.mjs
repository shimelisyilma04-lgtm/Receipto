// Send transactional email via Resend Model Context Protocol (MCP) server
import dotenv from 'dotenv';
dotenv.config({ override: true });

export async function sendEmailViaMCP({
  to,
  from = 'onboarding@resend.dev',
  subject,
  text,
  html,
  apiKey = process.env.RESEND_API_KEY
}) {
  if (!apiKey || apiKey === 'Redmoon56#' || !apiKey.startsWith('re_')) {
    return {
      success: false,
      configured: false,
      error: 'RESEND_API_KEY is not configured with a valid Resend API key (must start with re_).'
    };
  }

  const payload = {
    jsonrpc: '2.0',
    id: `mcp-${Date.now()}`,
    method: 'tools/call',
    params: {
      name: 'send-email',
      arguments: {
        to: Array.isArray(to) ? to : [to],
        from,
        subject,
        text: text || (html ? html.replace(/<[^>]+>/g, ' ') : subject),
        html: html || undefined,
        context: 'Sending a transactional email notification via the email delivery service.',
        llm_model: 'gemini-3.8-flash'
      }
    }
  };

  try {
    const res = await fetch('https://mcp.resend.com/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.error) {
      return {
        success: false,
        configured: true,
        error: `MCP RPC error (${data.error.code}): ${data.error.message}`
      };
    }

    const result = data.result;
    if (result && result.isError) {
      const errText = result.content?.map(c => c.text).join('\n') || 'Email failed to send via MCP';
      return {
        success: false,
        configured: true,
        error: errText
      };
    }

    return {
      success: true,
      configured: true,
      result: result
    };
  } catch (err) {
    return {
      success: false,
      configured: true,
      error: err.message
    };
  }
}

// CLI runner if invoked directly
if (process.argv[1]?.endsWith('send_mcp_email.mjs')) {
  const to = process.argv[2] || 'shimelisyilma04@gmail.com';
  const subject = process.argv[3] || 'Hello from MCP';
  const from = process.argv[4] || 'onboarding@resend.dev';

  console.log(`Attempting to send email via Resend MCP to ${to}...`);
  sendEmailViaMCP({
    to,
    subject,
    from,
    text: 'Hello from MCP!'
  }).then((res) => {
    console.log('Result:', JSON.stringify(res, null, 2));
    if (!res.success) {
      process.exitCode = 1;
    }
  });
}
