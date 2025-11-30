import { useEffect } from "react";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { initShopify } from "../shopify.server";
import { Page, Layout, Text, Card, BlockStack } from "@shopify/polaris";

export const loader = async ({ request, context }) => {
    const url = new URL(request.url);

    if (url.searchParams.get("shop")) {
        const shopify = initShopify(context.cloudflare.env);
        throw await shopify.login(request);
    }

    return json({ showWelcome: true });
};

export default function Index() {
    return (
        <Page>
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingLg" as="h1">
                                Kadwood Transparency Engine
                            </Text>
                            <Text as="p">
                                Welcome to the Kadwood Transparency Engine. Please install this app via your Shopify Admin to create transparency reports.
                            </Text>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
