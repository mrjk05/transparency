export const loader = async () => {
    // Return plain HTML for testing
    return new Response(
        `<!DOCTYPE html>
<html>
<head>
    <title>Kadwood Transparency Passport</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f6f6f7;
        }
        .container {
            text-align: center;
            background: white;
            padding: 60px 40px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 {
            margin: 0 0 20px 0;
            color: #202223;
        }
        p {
            color: #6d7175;
            margin: 0 0 30px 0;
        }
        button {
            background: #008060;
            color: white;
            border: none;
            padding: 12px 24px;
            font-size: 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        }
        button:hover {
            background: #006e52;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Kadwood Transparency Passport</h1>
        <p>Create transparency reports for your custom garments</p>
        <button onclick="window.location.href='/app' + window.location.search">Launch App</button>
    </div>
</body>
</html>`,
        {
            headers: {
                'Content-Type': 'text/html',
            },
        }
    );
};
