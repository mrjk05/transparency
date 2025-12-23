import React from "react";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Button, Text, Banner, ResourceList, ResourceItem, Avatar } from "@shopify/polaris";
import { verifySessionToken } from "../auth/verifySessionToken.server";

export const loader = async ({ request, context }) => {
    const { env } = context.cloudflare;
    const isMockMode = env.MOCK_MODE === "true";
    let orders = [];

    if (!isMockMode) {
        // Verify session token for embedded app
        const auth = await verifySessionToken(request, env.SHOPIFY_API_SECRET);

        if (!auth.ok) {
            return json({ error: `Unauthorized: ${auth.reason}` }, { status: 401 });
        }

        // Fetch orders from Shopify GraphQL API using token exchange
        try {
            const url = new URL(request.url);
            const sessionToken = url.searchParams.get('id_token');

            if (sessionToken) {
                // Exchange session token for access token
                const tokenExchangeResponse = await fetch(`https://${auth.shop}/admin/oauth/access_token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        client_id: env.SHOPIFY_API_KEY,
                        client_secret: env.SHOPIFY_API_SECRET,
                        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
                        subject_token: sessionToken,
                        subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
                        requested_token_type: 'urn:shopify:params:oauth:token-type:online-access-token',
                    }),
                });

                if (tokenExchangeResponse.ok) {
                    const tokenData = await tokenExchangeResponse.json();
                    const accessToken = tokenData.access_token;

                    // GraphQL query to fetch recent orders with pagination support
                    const url = new URL(request.url);
                    const cursor = url.searchParams.get('cursor');

                    const query = `
                        query GetOrders($cursor: String) {
                            orders(first: 10, reverse: true, after: $cursor) {
                                edges {
                                    cursor
                                    node {
                                        id
                                        name
                                        createdAt
                                        customer {
                                            displayName
                                            email
                                        }
                                        lineItems(first: 5) {
                                            edges {
                                                node {
                                                    id
                                                    title
                                                    quantity
                                                }
                                            }
                                        }
                                    }
                                }
                                pageInfo {
                                    hasNextPage
                                    endCursor
                                }
                            }
                        }
                    `;

                    const response = await fetch(`https://${auth.shop}/admin/api/2024-01/graphql.json`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Shopify-Access-Token': accessToken,
                        },
                        body: JSON.stringify({
                            query,
                            variables: cursor ? { cursor } : {}
                        }),
                    });

                    if (response.ok) {
                        const data = await response.json();
                        console.log('[Order Fetch] GraphQL response:', JSON.stringify(data));
                        if (data.data && data.data.orders) {
                            orders = data.data.orders.edges.map(edge => ({
                                id: edge.node.id,
                                name: edge.node.name,
                                createdAt: edge.node.createdAt,
                                customer: edge.node.customer,
                                lineItems: edge.node.lineItems.edges.map(li => li.node)
                            }));
                            console.log(`[Order Fetch] Found ${orders.length} orders`);

                            return json({
                                isMockMode: isMockMode || false,
                                orders: orders,
                                pageInfo: data.data.orders.pageInfo
                            });
                        }
                    } else {
                        console.error('[Order Fetch] GraphQL error:', response.status, await response.text());
                    }
                } else {
                    console.error('[Order Fetch] Token exchange failed:', tokenExchangeResponse.status, await tokenExchangeResponse.text());
                }
            } else {
                console.log('[Order Fetch] No session token in URL');
            }
        } catch (error) {
            console.error('[Order Fetch] Error:', error);
            // Continue with empty orders array
        }
    }

    return json({
        isMockMode: isMockMode || false,
        orders: orders
    });
};

export default function OrderSelection() {
    const loaderData = useLoaderData();
    const { isMockMode = false, orders: initialOrders = [], pageInfo } = loaderData || {};
    const navigate = useNavigate();
    const fetcher = useFetcher();

    const [orders, setOrders] = React.useState(initialOrders);
    const [hasNextPage, setHasNextPage] = React.useState(pageInfo?.hasNextPage || false);
    const [endCursor, setEndCursor] = React.useState(pageInfo?.endCursor || null);

    // Update orders when fetcher returns new data
    React.useEffect(() => {
        if (fetcher.data && fetcher.data.orders) {
            setOrders(prevOrders => [...prevOrders, ...fetcher.data.orders]);
            setHasNextPage(fetcher.data.pageInfo?.hasNextPage || false);
            setEndCursor(fetcher.data.pageInfo?.endCursor || null);
        }
    }, [fetcher.data]);

    const handleOrderSelect = (orderId) => {
        // Preserve all current query parameters (especially id_token, host, etc.)
        const currentParams = new URLSearchParams(window.location.search);
        currentParams.set('orderId', orderId);
        navigate(`/app/create-report?${currentParams.toString()}`);
    };

    const handleLoadMore = () => {
        if (!endCursor || fetcher.state === "loading") return;

        const currentParams = new URLSearchParams(window.location.search);
        currentParams.set('cursor', endCursor);
        fetcher.load(`/app?${currentParams.toString()}`);
    };

    return (
        <Page
            title="Select Order"
            subtitle="Choose an order to create a transparency report"
            primaryAction={{
                content: "Create Report Without Order",
                onAction: () => navigate('/app/create-report')
            }}
        >
            <Layout>
                <Layout.Section>
                    {isMockMode ? (
                        <Card>
                            <BlockStack gap="400">
                                <Banner tone="warning">
                                    <p>Mock mode is enabled. Order selection is disabled in development.</p>
                                </Banner>
                                <Button onClick={() => navigate('/app/create-report')} primary>
                                    Continue to Create Report (Mock Mode)
                                </Button>
                            </BlockStack>
                        </Card>
                    ) : (
                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingMd" as="h2">
                                    Recent Orders
                                </Text>

                                {orders.length === 0 ? (
                                    <Banner tone="info">
                                        <p>No orders found. Order fetching will be implemented in the next step.</p>
                                        <p>For now, you can proceed directly to create a report.</p>
                                    </Banner>
                                ) : (
                                    <>
                                        <ResourceList
                                            resourceName={{ singular: 'order', plural: 'orders' }}
                                            items={orders}
                                            renderItem={(order) => {
                                                const { id, name, customer, createdAt } = order;
                                                const media = <Avatar customer size="md" name={customer?.displayName} />;

                                                return (
                                                    <ResourceItem
                                                        id={id}
                                                        media={media}
                                                        onClick={() => handleOrderSelect(id)}
                                                    >
                                                        <Text variant="bodyMd" fontWeight="bold" as="h3">
                                                            {name}
                                                        </Text>
                                                        <div>{customer?.displayName || 'Guest'}</div>
                                                        <div>{new Date(createdAt).toLocaleDateString()}</div>
                                                    </ResourceItem>
                                                );
                                            }}
                                        />

                                        {hasNextPage && (
                                            <Button
                                                onClick={handleLoadMore}
                                                loading={fetcher.state === "loading"}
                                                fullWidth
                                            >
                                                Load Next 10 Orders
                                            </Button>
                                        )}
                                    </>
                                )}
                            </BlockStack>
                        </Card>
                    )}
                </Layout.Section>

                <Layout.Section variant="oneThird">
                    <Card>
                        <BlockStack gap="200">
                            <Text variant="headingSm" as="h3">About Transparency Reports</Text>
                            <Text as="p" tone="subdued">
                                Transparency reports provide detailed information about the sustainability and traceability of your products.
                            </Text>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
