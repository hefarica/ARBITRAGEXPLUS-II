"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { 
  Wallet, 
  Copy, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw,
  Coins,
  Network,
  TestTube,
  Info,
  DollarSign,
  Zap,
  Shield
} from "lucide-react";

interface TestnetConfig {
  enabled: boolean;
  currentNetwork: string;
  availableNetworks: string[];
  config: any;
  mode: string;
}

interface FaucetInfo {
  network: string;
  name: string;
  url: string;
  nativeToken: string;
}

interface Balance {
  native: string;
  tokens: Record<string, string>;
}

export default function TestnetGuidePage() {
  const [testnetConfig, setTestnetConfig] = useState<TestnetConfig | null>(null);
  const [faucets, setFaucets] = useState<FaucetInfo[]>([]);
  const [walletAddress, setWalletAddress] = useState("");
  const [balance, setBalance] = useState<Balance | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState("sepolia");
  const [loading, setLoading] = useState(false);
  const [testWallet, setTestWallet] = useState<any>(null);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchTestnetConfig();
    fetchFaucets();
  }, []);

  const fetchTestnetConfig = async () => {
    try {
      const response = await fetch("/api/testnet/config");
      const data = await response.json();
      setTestnetConfig(data);
      setSelectedNetwork(data.currentNetwork);
    } catch (error) {
      console.error("Error fetching testnet config:", error);
      toast({
        title: "Error",
        description: "Failed to load testnet configuration",
        variant: "destructive"
      });
    }
  };

  const fetchFaucets = async () => {
    try {
      const response = await fetch("/api/testnet/faucets");
      const data = await response.json();
      setFaucets(data);
    } catch (error) {
      console.error("Error fetching faucets:", error);
    }
  };

  const checkBalance = async () => {
    if (!walletAddress) {
      toast({
        title: "Error",
        description: "Please enter a wallet address",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/testnet/balance/${walletAddress}?network=${selectedNetwork}`);
      const data = await response.json();
      setBalance(data.balance);
      toast({
        title: "Success",
        description: "Balance fetched successfully"
      });
    } catch (error) {
      console.error("Error checking balance:", error);
      toast({
        title: "Error",
        description: "Failed to check balance",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const switchNetwork = async (mode: string, network?: string) => {
    setLoading(true);
    try {
      const response = await fetch("/api/testnet/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, network })
      });
      const data = await response.json();
      
      if (data.success) {
        await fetchTestnetConfig();
        toast({
          title: "Success",
          description: data.message
        });
        
        // Reload the page to apply changes
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (error) {
      console.error("Error switching network:", error);
      toast({
        title: "Error",
        description: "Failed to switch network",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const generateWallet = () => {
    // Generate a random wallet for testing
    const privateKey = "0x" + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");
    const address = "0x" + [...Array(40)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");
    const mnemonic = [
      "abandon", "ability", "able", "about", "above", "absent",
      "absorb", "abstract", "absurd", "abuse", "access", "accident"
    ].join(" ");

    setTestWallet({
      address,
      privateKey,
      mnemonic
    });

    toast({
      title: "Wallet Generated",
      description: "Test wallet created successfully. Save these credentials securely!"
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Copied to clipboard"
    });
  };

  const fetchTestOpportunities = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/testnet/opportunities?network=${selectedNetwork}`);
      const data = await response.json();
      setOpportunities(data);
    } catch (error) {
      console.error("Error fetching opportunities:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-2">
          <TestTube className="w-10 h-10 text-blue-500" />
          ArbitrageX Testnet Mode
        </h1>
        <p className="text-muted-foreground text-lg">
          Practice MEV strategies without risking real money
        </p>
        
        {testnetConfig && (
          <div className="flex items-center gap-4 mt-4">
            <Badge variant={testnetConfig.enabled ? "default" : "secondary"} className="text-sm py-1">
              Mode: {testnetConfig.mode.toUpperCase()}
            </Badge>
            {testnetConfig.enabled && (
              <Badge variant="outline" className="text-sm py-1">
                Network: {testnetConfig.currentNetwork}
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => switchNetwork(testnetConfig.enabled ? "mainnet" : "testnet")}
            >
              Switch to {testnetConfig.enabled ? "Mainnet" : "Testnet"}
            </Button>
          </div>
        )}
      </div>

      {/* Alert for testnet mode */}
      {testnetConfig?.enabled && (
        <Alert className="mb-6 border-blue-500 bg-blue-50 dark:bg-blue-950">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Testnet Mode Active</AlertTitle>
          <AlertDescription>
            You are currently in testnet mode. All transactions are simulated and use test tokens.
            No real money is at risk.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="guide" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="guide">Getting Started</TabsTrigger>
          <TabsTrigger value="wallet">Wallet Setup</TabsTrigger>
          <TabsTrigger value="faucets">Get Test Tokens</TabsTrigger>
          <TabsTrigger value="balance">Check Balance</TabsTrigger>
          <TabsTrigger value="practice">Practice Trading</TabsTrigger>
        </TabsList>

        {/* Getting Started Tab */}
        <TabsContent value="guide" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Welcome to Testnet Mode</CardTitle>
              <CardDescription>
                Learn how to use ArbitrageX without risking real funds
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-500" />
                  Quick Start Guide
                </h3>
                
                <div className="grid gap-4">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      1
                    </div>
                    <div>
                      <h4 className="font-medium">Generate or Import a Test Wallet</h4>
                      <p className="text-sm text-muted-foreground">
                        Create a new wallet for testing or import an existing one
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      2
                    </div>
                    <div>
                      <h4 className="font-medium">Get Test Tokens from Faucets</h4>
                      <p className="text-sm text-muted-foreground">
                        Visit testnet faucets to receive free test tokens
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      3
                    </div>
                    <div>
                      <h4 className="font-medium">Configure Your Settings</h4>
                      <p className="text-sm text-muted-foreground">
                        Set up your trading parameters and risk management
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      4
                    </div>
                    <div>
                      <h4 className="font-medium">Start Testing Strategies</h4>
                      <p className="text-sm text-muted-foreground">
                        Practice MEV strategies with simulated opportunities
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Shield className="w-5 h-5 text-green-500" />
                  Safety Features
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-medium">No Real Money Risk</p>
                      <p className="text-sm text-muted-foreground">All transactions use test tokens</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-medium">Isolated Environment</p>
                      <p className="text-sm text-muted-foreground">Testnet operations are completely separate</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-medium">Free Test Tokens</p>
                      <p className="text-sm text-muted-foreground">Get tokens from faucets daily</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-medium">Practice Mode</p>
                      <p className="text-sm text-muted-foreground">Perfect for learning and testing</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Wallet Setup Tab */}
        <TabsContent value="wallet" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Wallet Setup</CardTitle>
              <CardDescription>
                Generate a new wallet or import an existing one for testing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <Button onClick={generateWallet} className="w-full" size="lg">
                  <Wallet className="w-5 h-5 mr-2" />
                  Generate New Test Wallet
                </Button>
                
                {testWallet && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Test Wallet Generated!</AlertTitle>
                    <AlertDescription className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <div>
                          <p className="font-medium text-sm mb-1">Address:</p>
                          <div className="flex items-center gap-2">
                            <code className="bg-muted p-2 rounded text-xs flex-1 truncate">
                              {testWallet.address}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyToClipboard(testWallet.address)}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        
                        <div>
                          <p className="font-medium text-sm mb-1">Private Key:</p>
                          <div className="flex items-center gap-2">
                            <code className="bg-muted p-2 rounded text-xs flex-1 truncate">
                              {testWallet.privateKey}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyToClipboard(testWallet.privateKey)}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        
                        <div>
                          <p className="font-medium text-sm mb-1">Mnemonic Phrase:</p>
                          <div className="flex items-center gap-2">
                            <code className="bg-muted p-2 rounded text-xs flex-1">
                              {testWallet.mnemonic}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyToClipboard(testWallet.mnemonic)}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Important!</AlertTitle>
                        <AlertDescription>
                          This is a TESTNET wallet. Never use it for real funds!
                          Save these credentials securely if you want to reuse this wallet.
                        </AlertDescription>
                      </Alert>
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">MetaMask Setup</h3>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Follow these steps to add testnet networks to MetaMask:
                  </p>
                  <div className="bg-muted p-4 rounded-lg space-y-2">
                    <p className="font-medium">Sepolia Network:</p>
                    <ul className="text-sm space-y-1 ml-4">
                      <li>• Network Name: Sepolia</li>
                      <li>• RPC URL: https://rpc.sepolia.org</li>
                      <li>• Chain ID: 11155111</li>
                      <li>• Currency Symbol: ETH</li>
                      <li>• Explorer: https://sepolia.etherscan.io</li>
                    </ul>
                  </div>
                  <div className="bg-muted p-4 rounded-lg space-y-2">
                    <p className="font-medium">Mumbai Network:</p>
                    <ul className="text-sm space-y-1 ml-4">
                      <li>• Network Name: Mumbai</li>
                      <li>• RPC URL: https://rpc-mumbai.maticvigil.com</li>
                      <li>• Chain ID: 80001</li>
                      <li>• Currency Symbol: MATIC</li>
                      <li>• Explorer: https://mumbai.polygonscan.com</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Faucets Tab */}
        <TabsContent value="faucets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Testnet Faucets</CardTitle>
              <CardDescription>
                Get free test tokens for different networks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {faucets.map((faucet, index) => (
                  <Card key={index} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center justify-between">
                        {faucet.name}
                        <Badge variant="outline">{faucet.nativeToken}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Network className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{faucet.network}</span>
                        </div>
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={() => window.open(faucet.url, "_blank")}
                        >
                          <Coins className="w-4 h-4 mr-2" />
                          Get {faucet.nativeToken}
                          <ExternalLink className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Faucet Tips</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc ml-4 mt-2 space-y-1 text-sm">
                    <li>Most faucets have daily limits (usually 0.1-0.5 ETH/MATIC per day)</li>
                    <li>Some require social media verification for higher amounts</li>
                    <li>Use different faucets if one is down or rate-limited</li>
                    <li>Save some test tokens for gas fees</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Balance Checker Tab */}
        <TabsContent value="balance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Check Testnet Balance</CardTitle>
              <CardDescription>
                View your test token balances across different networks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Wallet Address</label>
                    <Input
                      placeholder="0x..."
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Network</label>
                    <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select network" />
                      </SelectTrigger>
                      <SelectContent>
                        {testnetConfig?.availableNetworks.map((network) => (
                          <SelectItem key={network} value={network}>
                            {network.charAt(0).toUpperCase() + network.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <Button onClick={checkBalance} disabled={loading} className="w-full">
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4 mr-2" />
                      Check Balance
                    </>
                  )}
                </Button>
              </div>

              {balance && (
                <div className="space-y-4">
                  <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Balance Retrieved</AlertTitle>
                    <AlertDescription className="mt-2">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Native Token:</span>
                          <span className="font-mono">{balance.native} ETH</span>
                        </div>
                        {Object.entries(balance.tokens).length > 0 && (
                          <div className="space-y-1 pt-2 border-t">
                            <p className="font-medium mb-1">Token Balances:</p>
                            {Object.entries(balance.tokens).map(([token, amount]) => (
                              <div key={token} className="flex justify-between items-center text-sm">
                                <span>{token}:</span>
                                <span className="font-mono">{amount}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Practice Trading Tab */}
        <TabsContent value="practice" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Practice MEV Trading</CardTitle>
              <CardDescription>
                Test your strategies with simulated opportunities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={fetchTestOpportunities} 
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Loading Opportunities...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Generate Test Opportunities
                  </>
                )}
              </Button>

              {opportunities.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Available Test Opportunities</h3>
                  <div className="grid gap-4">
                    {opportunities.map((opp, index) => (
                      <Card key={index} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">{opp.dexIn} → {opp.dexOut}</Badge>
                            <Badge variant="default" className="bg-green-500">
                              +${opp.estProfitUsd.toFixed(2)}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Pair:</span>
                              <p className="font-medium">{opp.baseToken}/{opp.quoteToken}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Amount:</span>
                              <p className="font-medium">{opp.amountIn}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Gas Cost:</span>
                              <p className="font-medium">${opp.gasUsd.toFixed(2)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Net Profit:</span>
                              <p className="font-medium text-green-500">
                                ${(opp.estProfitUsd - opp.gasUsd).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                        <CardFooter>
                          <Button className="w-full" variant="outline" size="sm">
                            Execute Test Trade
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Practice Mode Features</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc ml-4 mt-2 space-y-1 text-sm">
                    <li>All trades are simulated - no real execution</li>
                    <li>Test different strategies without risk</li>
                    <li>Monitor performance metrics</li>
                    <li>Perfect for learning MEV strategies</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}