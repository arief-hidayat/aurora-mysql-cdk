#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuroraMysqlCdkStack } from '../lib/aurora-mysql-cdk-stack';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as aas from 'aws-cdk-lib/aws-applicationautoscaling';

const app = new cdk.App();
new AuroraMysqlCdkStack(app, 'AuroraMysqlCdkStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  vpcName: 'AriefhInfraStack/dev-vpc',
  auroraVersion: rds.AuroraMysqlEngineVersion.VER_3_03_0,
  defaultDatabaseName: 'ariefh',
  dbInstances: 2,
  dbInstanceType: ec2.InstanceType.of(ec2.InstanceClass.R6G, ec2.InstanceSize.LARGE),
  dbPort: 3306,
  vpcSubnets: {
    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
  },
  dbParams: [
    { key: 'time_zone', value: 'Asia/Bangkok'}
  ],
  allowInboundFrom: [
    ec2.Peer.ipv4('10.1.2.0/24'),
    // ec2.Peer.securityGroupId('the-app-security-group-id-that-want-to-access-db')
  ],
  dbScaling: {
    minCapacity: 1, maxCapacity: 4, scalingTarget: 40, predefinedMetric: aas.PredefinedMetric.RDS_READER_AVERAGE_CPU_UTILIZATION
  },
  backup: {
    retention: cdk.Duration.days(1),
    preferredWindow: '17:00-18:00'
  },
  // just uncomment if don't want rdsProxy
  rdsProxy: {
    debugLogging: true,
  }
});