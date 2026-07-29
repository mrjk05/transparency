import React from "react";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useLocation, useNavigate, useFetcher } from "@remix-run/react";
import { withSearch } from "../utils/withSearch";
import { Page, Layout, Card, BlockStack, Button, Text, Banner, ResourceList, ResourceItem, Avatar } from "@shopify/polaris";
import { resolveAuth } from "../auth/resolveAuth.server";
import { getAdminAccessToken } from "../auth/adminToken.server";

export const loader = async ({ request, context }) => {
    const { env } = context.cloudflare;
    const isMockMode = env.MOCK_MODE === "true";
    let orders = [];

    if (!isMockMode) {
        const auth = await resolveAuth(request, env);

        if (!auth.ok) {
            return json({ error: `Unauthorized: ${auth.reason}` }, { status: auth.status });
        }

        // Fetch orders from Shopify GraphQL API
        try {
            const accessToken = await getAdminAccessToken(request, env, auth);

            if (accessToken) {
                // GraphQL query to fetch recent orders with pagination support
                const cursor = new URL(request.url).searchParams.get('cursor');

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
                    // Deliberately not logging the response body: it carries every listed
                    // customer's display name and email address, and Worker logs are a far
                    // wider audience than the admin screen that asked for them.
                    if (data.errors) {
                        console.error('[Order Fetch] GraphQL userErrors:', JSON.stringify(data.errors));
                    }
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
                console.error(`[Order Fetch] No Admin API token available for mode "${auth.mode}"`);
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
    const { isMockMode = false, orders: initialOrders = [], pageInfo, error } = loaderData || {};
    const navigate = useNavigate();
    const fetcher = useFetcher();
    const { search } = useLocation();

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

    // An auth failure is the one case where the rest of this page is meaningless: the order
    // list is empty not because there are no orders but because we were not allowed to ask.
    // Saying so beats rendering "No orders found", which sends the stylist looking for a
    // problem in Shopify.
    if (error) {
        return (
            <Page title="Select Order">
                <Layout>
                    <Layout.Section>
                        <Banner tone="critical" title="Not signed in">
                            <p>{error}</p>
                            <p>Open this app from the Shopify admin, or from Kadwood Studio under Tools.</p>
                        </Banner>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    return (
        <Page
            title="Select Order"
            subtitle="Choose an order to create a transparency report"
            primaryAction={{
                content: "Create Report Without Order",
                onAction: () => navigate(withSearch('/app/create-report', search))
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
                                <Button onClick={() => navigate(withSearch('/app/create-report', search))} primary>
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
